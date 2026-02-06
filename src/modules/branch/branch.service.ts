import { ForbiddenException, Injectable } from '@nestjs/common';
import { RequestContextService } from '../../common/request-context/request-context.service';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { BranchRepository } from './branch.repository';
import { CreateBranchRequestDto } from './dto/create-branch.request.dto';
import { UpdateBranchRequestDto } from './dto/update-branch.request.dto';

@Injectable()
export class BranchService {
  constructor(
    private readonly branchRepository: BranchRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  async create(dto: CreateBranchRequestDto, currentUser: JwtUser) {
    const branchName = dto.name.trim().toLowerCase();

    if (!currentUser.isSuperAdmin && branchName === 'main') {
      throw new ForbiddenException('You cannot create a branch named "main"');
    }

    return this.branchRepository.createInCurrentCompany(dto);
  }

  async findAll(currentUser: JwtUser) {
    return this.branchRepository.findAll();
  }

  async findOne(id: string, currentUser: JwtUser) {
    return this.branchRepository.findOneOrThrow(id);
  }

  async update(id: string, dto: UpdateBranchRequestDto, currentUser: JwtUser) {
    const branch = await this.branchRepository.findOneOrThrow(id);

    if (
      !this.requestContext.isSuperAdmin() &&
      branch.name.trim().toLowerCase() === 'main'
    ) {
      throw new ForbiddenException('You cannot update the "main" branch');
    }

    return this.branchRepository.update(id, dto);
  }

  async remove(id: string, currentUser: JwtUser) {
    const branch = await this.branchRepository.findOneOrThrow(id);

    if (
      !this.requestContext.isSuperAdmin() &&
      branch.name.trim().toLowerCase() === 'main'
    ) {
      throw new ForbiddenException('You cannot delete the "main" branch');
    }

    await this.branchRepository.removeById(branch.id);
    return { message: 'Branch deleted successfully' };
  }
}
