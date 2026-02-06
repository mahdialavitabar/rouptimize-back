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
import { CreateRoleRequestDto } from './dto/create-role.request.dto';
import { UpdateRoleRequestDto } from './dto/update-role.request.dto';
import { RoleService } from './role.service';

@ApiBearerAuth()
@ApiTags('roles')
@Controller('roles')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @Roles(PERMISSIONS.ROLES.CREATE)
  create(@Body() dto: CreateRoleRequestDto, @CurrentUser() user: JwtUser) {
    return this.roleService.create(dto, user);
  }

  @Get()
  @Roles(PERMISSIONS.ROLES.READ)
  findAll(@CurrentUser() user: JwtUser) {
    return this.roleService.findAll(user);
  }

  @Get(':id')
  @Roles(PERMISSIONS.ROLES.READ)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.roleService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(PERMISSIONS.ROLES.UPDATE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.roleService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(PERMISSIONS.ROLES.DELETE)
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.roleService.remove(id, user);
  }
}
