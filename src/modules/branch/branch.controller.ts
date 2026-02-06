import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PERMISSIONS } from '../core/auth/shared/constants/permissions';
import { CurrentUser } from '../core/auth/shared/decorators/current-user.decorator';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { Roles } from '../core/auth/shared/roles/roles.decorator';
import { RolesGuard } from '../core/auth/shared/roles/roles.guard';
import { BranchService } from './branch.service';
import { CreateBranchRequestDto } from './dto/create-branch.request.dto';
import { UpdateBranchRequestDto } from './dto/update-branch.request.dto';

@ApiBearerAuth()
@ApiTags('branches')
@Controller('branches')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @Roles(PERMISSIONS.BRANCHES.CREATE)
  create(@Body() dto: CreateBranchRequestDto, @CurrentUser() user: JwtUser) {
    return this.branchService.create(dto, user);
  }

  @Get()
  @Roles(PERMISSIONS.BRANCHES.READ)
  findAll(@CurrentUser() user: JwtUser) {
    return this.branchService.findAll(user);
  }

  @Get(':id')
  @Roles(PERMISSIONS.BRANCHES.READ)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.branchService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(PERMISSIONS.BRANCHES.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.branchService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(PERMISSIONS.BRANCHES.DELETE)
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.branchService.remove(id, user);
  }
}
