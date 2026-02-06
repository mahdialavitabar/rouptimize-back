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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PERMISSIONS } from '../core/auth/shared/constants/permissions';
import { CurrentUser } from '../core/auth/shared/decorators/current-user.decorator';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { Roles } from '../core/auth/shared/roles/roles.decorator';
import { RolesGuard } from '../core/auth/shared/roles/roles.guard';
import { DriverService } from './driver.service';
import { CreateDriverInviteRequestDto } from './dto/create-driver-invite.request.dto';
import { CreateDriverRequestDto } from './dto/create-driver.request.dto';
import { UpdateDriverRequestDto } from './dto/update-driver.request.dto';
import { UpdateMobileUserRequestDto } from './dto/update-mobile-user.request.dto';

@ApiBearerAuth()
@ApiTags('drivers')
@Controller('drivers')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Post()
  @Roles(PERMISSIONS.DRIVERS.CREATE)
  @ApiOperation({ summary: 'Create a new driver' })
  create(@Body() dto: CreateDriverRequestDto, @CurrentUser() user: JwtUser) {
    return this.driverService.create(dto, user);
  }

  @Get()
  @Roles(PERMISSIONS.DRIVERS.READ)
  @ApiOperation({ summary: 'Get all drivers' })
  findAll(@CurrentUser() user: JwtUser) {
    return this.driverService.findAll(user);
  }

  @Get(':id')
  @Roles(PERMISSIONS.DRIVERS.READ)
  @ApiOperation({ summary: 'Get driver by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.driverService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(PERMISSIONS.DRIVERS.UPDATE)
  @ApiOperation({ summary: 'Update driver by ID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDriverRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.driverService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(PERMISSIONS.DRIVERS.DELETE)
  @ApiOperation({ summary: 'Delete driver by ID' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.driverService.remove(id, user);
  }

  @Post(':id/invite')
  @Roles(PERMISSIONS.DRIVERS.UPDATE)
  @ApiOperation({ summary: 'Create invite code for driver' })
  createInvite(
    @Param('id') id: string,
    @Body() dto: Omit<CreateDriverInviteRequestDto, 'driverId'>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.driverService.createInvite({ ...dto, driverId: id }, user);
  }

  @Get(':id/invite')
  @Roles(PERMISSIONS.DRIVERS.READ)
  @ApiOperation({ summary: 'Get active invite code for driver' })
  getInvite(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.driverService.getDriverInvite(id, user);
  }

  @Delete(':id/invite')
  @Roles(PERMISSIONS.DRIVERS.UPDATE)
  @ApiOperation({ summary: 'Revoke invite code for driver' })
  revokeInvite(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.driverService.revokeInvite(id, user);
  }

  @Get(':id/devices')
  @Roles(PERMISSIONS.DRIVERS.READ)
  @ApiOperation({ summary: 'Get mobile devices for driver' })
  getDriverDevices(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.driverService.getDriverDevices(id, user);
  }

  // Mobile User Management Endpoints (nested under drivers)

  @Get('mobile-users/all')
  @Roles(PERMISSIONS.MOBILE_USERS.READ)
  @ApiOperation({ summary: 'Get all mobile users for the company' })
  findAllMobileUsers(@CurrentUser() user: JwtUser) {
    return this.driverService.findAllMobileUsers(user);
  }

  @Get('mobile-users/:mobileUserId')
  @Roles(PERMISSIONS.MOBILE_USERS.READ)
  @ApiOperation({ summary: 'Get a mobile user by ID' })
  findOneMobileUser(
    @Param('mobileUserId') mobileUserId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.driverService.findOneMobileUser(mobileUserId, user);
  }

  @Patch('mobile-users/:mobileUserId')
  @Roles(PERMISSIONS.MOBILE_USERS.UPDATE)
  @ApiOperation({
    summary: 'Update a mobile user (permissions, blocked status, etc.)',
  })
  updateMobileUser(
    @Param('mobileUserId') mobileUserId: string,
    @Body() dto: UpdateMobileUserRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.driverService.updateMobileUser(mobileUserId, dto, user);
  }

  @Post('mobile-users/:mobileUserId/block')
  @Roles(PERMISSIONS.MOBILE_USERS.UPDATE)
  @ApiOperation({ summary: 'Block a mobile user' })
  blockMobileUser(
    @Param('mobileUserId') mobileUserId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.driverService.blockMobileUser(mobileUserId, user);
  }

  @Post('mobile-users/:mobileUserId/unblock')
  @Roles(PERMISSIONS.MOBILE_USERS.UPDATE)
  @ApiOperation({ summary: 'Unblock a mobile user' })
  unblockMobileUser(
    @Param('mobileUserId') mobileUserId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.driverService.unblockMobileUser(mobileUserId, user);
  }

  @Delete('mobile-users/:mobileUserId')
  @Roles(PERMISSIONS.MOBILE_USERS.DELETE)
  @ApiOperation({ summary: 'Delete a mobile user' })
  removeMobileUser(
    @Param('mobileUserId') mobileUserId: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.driverService.removeMobileUser(mobileUserId, user);
  }
}
