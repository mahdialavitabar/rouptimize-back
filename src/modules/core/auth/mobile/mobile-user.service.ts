import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { DB_POOL } from '../../../../common/database/database.tokens';
import { setLocalRlsRole } from '../../../../common/database/rls-role';
import { RequestContextService } from '../../../../common/request-context/request-context.service';
import * as schema from '../../../../db/schema';
import { RegisterMobileUserRequestDto } from './dto/register-mobile-user.request.dto';
import { MobileUserRepository } from './mobile-user.repository';

type MobileAuthSeed = {
  id: string;
  username: string;
  password: string;
  companyId: string;
  branchId: string | null;
  roleId: string | null;
  driverId: string | null;
  permissions: string | null;
  isBlocked: boolean;
  isSuperAdmin: boolean;
};

@Injectable()
export class MobileUserService {
  constructor(
    private readonly users: MobileUserRepository,
    private readonly ctx: RequestContextService,
    @Inject(DB_POOL)
    private readonly pool: Pool,
  ) {}

  private normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
  }

  private async pickSeed(
    username: string,
    companyId?: string,
  ): Promise<MobileAuthSeed | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await setLocalRlsRole(client);

      const db = drizzle(client, { schema });

      if (companyId) {
        await client.query("SET LOCAL app.is_superadmin = 'false'");
        await client.query(
          "SELECT set_config('app.current_company_id', $1::text, true)",
          [companyId],
        );

        const seed = await this.ctx.run(
          {
            companyId,
            branchId: undefined,
            userId: undefined,
            isSuperAdmin: false,
            roleName: undefined,
            permissions: [],
            pgClient: client,
            db,
          },
          () =>
            this.users.findAuthSeedByUsernameAndCompanyId(username, companyId),
        );

        await client.query('COMMIT');
        return (seed as any) ?? null;
      }

      // No companyId provided: search across companies (RLS bypass)
      await client.query("SET LOCAL app.is_superadmin = 'true'");
      await client.query(
        "SELECT set_config('app.current_company_id', '', true)",
      );

      const seeds = (await this.ctx.run(
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
        () => this.users.findAuthSeedsByUsername(username),
      )) as any[];

      await client.query('COMMIT');

      if (!seeds || seeds.length === 0) {
        return null;
      }

      if (seeds.length === 1) {
        return seeds[0] as any;
      }

      throw new BadRequestException(
        'Multiple mobile users found for this username. Provide companyId.',
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findByUsernameAndCompany(username: string, companyId: string) {
    const normalized = this.normalizeUsername(username);
    return this.users.findByUsernameAndCompanyId(normalized, companyId);
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

  async registerWithInviteCode(dto: RegisterMobileUserRequestDto) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // NOTE: We intentionally do NOT call setLocalRlsRole() here.
      // Registration is a special case where we need to bypass RLS entirely
      // because we're creating a new user before any authentication exists.
      // The invite code validation provides the security context.

      const db = drizzle(client, { schema });

      // Lookup invite across tenants (unique code)
      const invite = await this.ctx.run(
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
        () => this.users.findValidInviteByCode(dto.inviteCode),
      );

      if (!invite) {
        throw new BadRequestException('Invalid or already used invite code');
      }

      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        throw new BadRequestException('Invite code has expired');
      }

      // Keep superadmin mode for registration operations since:
      // 1. The invite code validates the company context
      // 2. There's no authenticated user context yet
      // 3. We explicitly set companyId from the validated invite
      const normalized = this.normalizeUsername(dto.username);

      const existing = await this.ctx.run(
        {
          companyId: invite.companyId,
          branchId: invite.branchId ?? undefined,
          userId: undefined,
          isSuperAdmin: true,
          roleName: undefined,
          permissions: [],
          pgClient: client,
          db,
        },
        () =>
          this.users.findByUsernameAndCompanyId(normalized, invite.companyId),
      );

      if (existing) {
        throw new BadRequestException(
          'Username already exists for this company',
        );
      }

      const hashedPassword = await bcrypt.hash(dto.password, 10);

      const created = await this.ctx.run(
        {
          companyId: invite.companyId,
          branchId: invite.branchId ?? undefined,
          userId: undefined,
          isSuperAdmin: true,
          roleName: undefined,
          permissions: [],
          pgClient: client,
          db,
        },
        () =>
          this.users.create({
            username: normalized,
            password: hashedPassword,
            companyId: invite.companyId,
            name: invite.driver?.name ?? undefined,
            branchId: invite.branchId,
            driverId: invite.driverId,
          }),
      );

      await this.ctx.run(
        {
          companyId: invite.companyId,
          branchId: invite.branchId ?? undefined,
          userId: undefined,
          isSuperAdmin: true,
          roleName: undefined,
          permissions: [],
          pgClient: client,
          db,
        },
        () => this.users.markInviteAsUsed(invite.id, created.id),
      );

      await client.query('COMMIT');

      const { password: _pw, ...rest } = created as any;
      return rest;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createMobileUser(dto: RegisterMobileUserRequestDto) {
    return this.registerWithInviteCode(dto);
  }

  async validateMobileUser(
    username: string,
    password: string,
    companyId?: string,
  ) {
    const normalized = this.normalizeUsername(username);
    const seed = await this.pickSeed(normalized, companyId);
    if (!seed) return null;

    // Check if user is blocked before validating password
    if (seed.isBlocked) {
      throw new UnauthorizedException(
        'Your account has been blocked. Please contact your administrator.',
      );
    }

    const ok = await bcrypt.compare(password, seed.password);
    if (!ok) return null;

    const full = await this.findByIdWithRlsBootstrap(seed);
    if (!full) {
      throw new UnauthorizedException('Mobile user not found');
    }

    const { password: _pw, ...rest } = full as any;
    return rest;
  }

  async findAll() {
    return this.users.findAll();
  }

  async updateMobileUser(
    id: string,
    data: {
      permissions?: string | null;
      isBlocked?: boolean;
      name?: string;
      email?: string;
      phone?: string;
    },
  ) {
    return this.users.update(id, data);
  }

  async deleteMobileUser(id: string) {
    return this.users.softDelete(id);
  }

  private async findByIdWithRlsBootstrap(seed: MobileAuthSeed) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await setLocalRlsRole(client);

      if (seed.isSuperAdmin) {
        await client.query("SET LOCAL app.is_superadmin = 'true'");
      } else if (seed.companyId) {
        await client.query(
          "SELECT set_config('app.current_company_id', $1::text, true)",
          [seed.companyId],
        );
      } else {
        throw new UnauthorizedException(
          'Company scope missing for mobile user',
        );
      }

      const db = drizzle(client, { schema });

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
        () => this.users.findOneById(seed.id),
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
}
