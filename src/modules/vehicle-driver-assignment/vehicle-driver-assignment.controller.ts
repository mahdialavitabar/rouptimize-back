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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PERMISSIONS } from '../core/auth/shared/constants/permissions';
import { CurrentUser } from '../core/auth/shared/decorators/current-user.decorator';
import type { JwtUser } from '../core/auth/shared/interfaces/jwt-user.interface';
import { Roles } from '../core/auth/shared/roles/roles.decorator';
import { RolesGuard } from '../core/auth/shared/roles/roles.guard';
import { CreateVehicleDriverAssignmentRequestDto } from './dto/create-vehicle-driver-assignment.request.dto';
import { UpdateVehicleDriverAssignmentRequestDto } from './dto/update-vehicle-driver-assignment.request.dto';
import { VehicleDriverAssignmentService } from './vehicle-driver-assignment.service';

@ApiBearerAuth()
@ApiTags('vehicle-driver-assignments')
@Controller('vehicle-driver-assignments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class VehicleDriverAssignmentController {
  constructor(
    private readonly assignmentService: VehicleDriverAssignmentService,
  ) {}

  @Post()
  @Roles(PERMISSIONS.VEHICLE_DRIVER_ASSIGNMENTS.CREATE)
  @ApiOperation({ summary: 'Assign a driver to a vehicle' })
  create(
    @Body() dto: CreateVehicleDriverAssignmentRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.assignmentService.create(dto, user);
  }

  @Get()
  @Roles(PERMISSIONS.VEHICLE_DRIVER_ASSIGNMENTS.READ)
  @ApiOperation({ summary: 'Get all vehicle-driver assignments' })
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.assignmentService.findAll(user, from, to);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get current vehicle assignment for the logged-in driver',
  })
  findMe(@CurrentUser() user: JwtUser) {
    return this.assignmentService.findMyAssignment(user);
  }

  @Get(':id')
  @Roles(PERMISSIONS.VEHICLE_DRIVER_ASSIGNMENTS.READ)
  @ApiOperation({ summary: 'Get a vehicle-driver assignment by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.assignmentService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(PERMISSIONS.VEHICLE_DRIVER_ASSIGNMENTS.UPDATE)
  @ApiOperation({ summary: 'Update a vehicle-driver assignment' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDriverAssignmentRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.assignmentService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(PERMISSIONS.VEHICLE_DRIVER_ASSIGNMENTS.DELETE)
  @ApiOperation({ summary: 'Delete a vehicle-driver assignment' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.assignmentService.remove(id, user);
  }
}
