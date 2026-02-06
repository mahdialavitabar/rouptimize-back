import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { PERMISSIONS } from '../core/auth/shared/constants/permissions';
import { CurrentUser } from '../core/auth/shared/decorators/current-user.decorator';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { Roles } from '../core/auth/shared/roles/roles.decorator';
import { RolesGuard } from '../core/auth/shared/roles/roles.guard';
import { CreateVehicleRequestDto } from './dto/create-vehicle.request.dto';
import { UpdateVehicleRequestDto } from './dto/update-vehicle.request.dto';
import { VehicleService } from './vehicle.service';

@ApiBearerAuth()
@ApiTags('vehicles')
@Controller('vehicles')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post()
  @Roles(PERMISSIONS.VEHICLES.CREATE)
  @ApiOperation({ summary: 'Create a new vehicle' })
  create(@Body() dto: CreateVehicleRequestDto, @CurrentUser() user: JwtUser) {
    return this.vehicleService.create(dto, user);
  }

  @Get()
  @Roles(PERMISSIONS.VEHICLES.READ)
  @ApiOperation({ summary: 'Get all vehicles' })
  @ApiQuery({ name: 'branchId', required: false })
  findAll(@CurrentUser() user: JwtUser, @Query('branchId') branchId?: string) {
    return this.vehicleService.findAll(user, branchId);
  }

  @Get(':id')
  @Roles(PERMISSIONS.VEHICLES.READ)
  @ApiOperation({ summary: 'Get vehicle by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.vehicleService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(PERMISSIONS.VEHICLES.UPDATE)
  @ApiOperation({ summary: 'Update vehicle by ID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.vehicleService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(PERMISSIONS.VEHICLES.DELETE)
  @ApiOperation({ summary: 'Delete vehicle by ID' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.vehicleService.remove(id, user);
  }
}
