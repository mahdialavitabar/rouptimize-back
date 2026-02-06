import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { DB_POOL } from '../../common/database/database.tokens';
import { setLocalRlsRole } from '../../common/database/rls-role';
import { RequestContextService } from '../../common/request-context/request-context.service';
import * as schema from '../../db/schema';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { FORBIDDEN_USERNAMES } from '../core/auth/shared/utils/username-blacklist';
import { CreateUserRequestDto } from './dto/create-user.request.dto';
import { UpdateUserRequestDto } from './dto/update-user.request.dto';
import { UserResponseDto } from './dto/user.response.dto';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly ctx: RequestContextService,
    @Inject(DB_POOL)
    private readonly pool: Pool,
  ) {}

  async create(dto: CreateUserRequestDto, currentUser: JwtUser) {
    const normalizedUsername = dto.username.trim().toLowerCase();

    if (FORBIDDEN_USERNAMES.has(normalizedUsername)) {
      throw new BadRequestException('This username is reserved or not allowed');
    }

    const existingUser = await this.users.findOneByUsername(normalizedUsername);
    if (existingUser) {
      throw new BadRequestException('Username is already taken');
    }

    let role = null;
    if (dto.roleId) {
      role = await this.users.findRoleForAssignment(dto.roleId);
      if (!role) throw new BadRequestException('Invalid role ID');
    }

    let branch = null;
    if (dto.branchId) {
      branch = await this.users.findBranchForAssignment(dto.branchId);
      if (!branch) throw new BadRequestException('Invalid branch ID');
    } else {
      branch = await this.users.findMainBranch();
      if (!branch) {
        throw new NotFoundException('Main branch for the company not found');
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const companyId = this.ctx.requireCompanyId();

    const user: UserResponseDto = this.users.create({
      username: normalizedUsername,
      password: hashedPassword,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      companyId,
      branchId: branch?.id,
      branch,
      roleId: role?.id,
      role: role ?? undefined,
      isSuperAdmin: false,
    } as any);

    const saved = await this.users.save(user);
    if (!saved) {
      throw new NotFoundException('User not found');
    }
    return saved;
  }

  async findAll(currentUser: JwtUser) {
    const users = await this.users.findAll();
    if (currentUser.isSuperAdmin) {
      return users;
    }

    return users.filter((user: UserResponseDto) => !user.isSuperAdmin);
  }

  async findOne(id: string, currentUser: JwtUser) {
    const user = await this.users.findUserOrMobileById(id);
    if (!user) throw new NotFoundException('User not found');

    if (!currentUser.isSuperAdmin && user.isSuperAdmin) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, dto: UpdateUserRequestDto, currentUser: JwtUser) {
    if ((dto as any).isSuperAdmin !== undefined) {
      throw new ForbiddenException('Modifying isSuperAdmin is not allowed');
    }

    if ((dto as any).companyId !== undefined) {
      throw new ForbiddenException('Modifying company is not allowed');
    }

    const user = await this.findOne(id, currentUser);

    if (dto.username !== undefined) {
      const normalizedUsername = dto.username.trim().toLowerCase();

      if (FORBIDDEN_USERNAMES.has(normalizedUsername)) {
        throw new BadRequestException(
          'This username is reserved or not allowed',
        );
      }

      const existingUser =
        await this.users.findOneByUsername(normalizedUsername);

      if (existingUser && existingUser.id !== user.id) {
        throw new BadRequestException('Username is already taken');
      }

      user.username = normalizedUsername;
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.password !== undefined)
      user.password = await bcrypt.hash(dto.password, 10);
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.address !== undefined) user.address = dto.address;

    if (dto.roleId !== undefined) {
      const role = await this.users.findRoleForAssignment(dto.roleId);
      if (!role) throw new BadRequestException('Invalid role ID');
      user.roleId = role.id;
      user.role = role;
    }

    if (dto.branchId !== undefined) {
      const branch = await this.users.findBranchForAssignment(dto.branchId);
      if (!branch) throw new BadRequestException('Invalid branch ID');
      user.branchId = branch.id;
      user.branch = branch;
    }

    const saved =
      currentUser.actorType === 'mobile' && currentUser.userId === id
        ? await this.users.saveMobileUser(user)
        : await this.users.save(user);
    if (!saved) {
      throw new NotFoundException('User not found');
    }
    return saved;
  }

  async remove(userId: string, currentUser: JwtUser) {
    const user = await this.users.findOneById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!currentUser.isSuperAdmin && user.isSuperAdmin) {
      throw new ForbiddenException('You cannot delete superadmin users');
    }

    if (
      !this.ctx.isSuperAdmin() &&
      (user.role as any)?.name === 'companyAdmin'
    ) {
      throw new ForbiddenException('You cannot delete a company admin');
    }

    const removed = await this.users.remove(user);
    if (!removed) {
      throw new NotFoundException('User not found');
    }
    return removed;
  }

  async findByUsername(username: string, currentUser?: JwtUser) {
    if (!username) return null;
    const normalized = username.trim().toLowerCase();

    if (this.ctx.get()?.db) {
      return this.users.findOneByUsername(normalized);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await setLocalRlsRole(client);

      // Temporarily bypass RLS to locate the auth seed globally
      await client.query("SET LOCAL app.is_superadmin = 'true'");
      await client.query(
        "SELECT set_config('app.current_company_id', '', true)",
      );

      const db = drizzle(client, { schema });

      const seed = await this.ctx.run(
        {
          companyId: undefined,
          branchId: undefined,
          userId: undefined,
          isSuperAdmin: true,
          roleName: undefined,
          permissions: [],
          pgClient: client,
          db,
        },
        () => this.users.findAuthSeedByUsername(normalized),
      );

      if (!seed) {
        await client.query('ROLLBACK');
        return null;
      }

      if (seed.isSuperAdmin) {
        await client.query("SET LOCAL app.is_superadmin = 'true'");
        await client.query(
          "SELECT set_config('app.current_company_id', '', true)",
        );
      } else if (seed.companyId) {
        await client.query("SET LOCAL app.is_superadmin = 'false'");
        await client.query(
          "SELECT set_config('app.current_company_id', $1::text, true)",
          [seed.companyId],
        );
      } else {
        throw new UnauthorizedException('Company scope missing for user');
      }

      const result = await this.ctx.run(
        {
          companyId: seed.companyId ?? undefined,
          branchId: seed.branchId ?? undefined,
          userId: seed.id,
          isSuperAdmin: seed.isSuperAdmin ?? false,
          roleName: undefined,
          permissions: [],
          pgClient: client,
          db,
        },
        () => this.users.findOneByUsername(normalized),
      );

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string) {
    if (this.ctx.get()?.db) {
      return this.users.findOneById(id);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await setLocalRlsRole(client);
      await client.query("SET LOCAL app.is_superadmin = 'true'");
      await client.query(
        "SELECT set_config('app.current_company_id', '', true)",
      );

      const db = drizzle(client, { schema });

      const result = await this.ctx.run(
        {
          companyId: undefined,
          branchId: undefined,
          userId: undefined,
          isSuperAdmin: true,
          roleName: undefined,
          permissions: [],
          pgClient: client,
          db,
        },
        () => this.users.findOneById(id),
      );

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAvatar(userId: string, filename: string) {
    const user = await this.users.findOneById(userId);
    if (!user) throw new NotFoundException('User not found');

    user.imageUrl = `/uploads/avatars/${filename}`;
    const saved = await this.users.save(user);
    if (!saved) {
      throw new NotFoundException('User not found');
    }
    return saved;
  }
}
