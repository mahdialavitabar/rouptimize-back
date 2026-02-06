import { ForbiddenException, Injectable } from '@nestjs/common';
import { RequestContextService } from '../../common/request-context/request-context.service';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { CreateRoleRequestDto } from './dto/create-role.request.dto';
import { UpdateRoleRequestDto } from './dto/update-role.request.dto';
import { RoleRepository } from './role.repository';

@Injectable()
export class RoleService {
  constructor(
    private readonly roleRepository: RoleRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async create(dto: CreateRoleRequestDto, currentUser: JwtUser) {
    if (dto.name.trim().toLowerCase() === 'companyadmin') {
      throw new ForbiddenException(
        "You cannot create a role with name 'companyAdmin'",
      );
    }

    const role = this.roleRepository.createInCurrentCompany(dto);
    return this.roleRepository.save(role);
  }

  async findAll(currentUser: JwtUser) {
    return this.roleRepository.findAll();
  }

  async findOne(id: string, currentUser: JwtUser) {
    return this.roleRepository.findOneOrThrow(id);
  }

  async update(id: string, dto: UpdateRoleRequestDto, currentUser: JwtUser) {
    const role = await this.roleRepository.findOneOrThrow(id);

    if (
      !this.requestContext.isSuperAdmin() &&
      dto.name &&
      dto.name.trim().toLowerCase() === 'companyadmin'
    ) {
      throw new ForbiddenException(
        "You cannot rename a role to 'companyAdmin'",
      );
    }

    Object.assign(role, dto);
    return this.roleRepository.save(role);
  }

  async remove(id: string, currentUser: JwtUser) {
    const role = await this.roleRepository.findOneOrThrow(id);

    if (
      !this.requestContext.isSuperAdmin() &&
      role.name.trim().toLowerCase() === 'companyadmin'
    ) {
      throw new ForbiddenException("You cannot delete the 'companyAdmin' role");
    }

    return this.roleRepository.remove(role);
  }
}
