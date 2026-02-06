import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../core/auth/shared/constants/permissions';
import { Roles } from '../core/auth/shared/roles/roles.decorator';
import { RolesGuard } from '../core/auth/shared/roles/roles.guard';
import { AddMissionsRequestDto } from './dto/add-missions.request.dto';
import { AssignVehicleRequestDto } from './dto/assign-vehicle.request.dto';
import { CreateRouteRequestDto } from './dto/create-route.request.dto';
import { RoutePlanRouteRequestDto } from './dto/plan-route.request.dto';
import { RouteService } from './route.service';

@ApiBearerAuth()
@ApiTags('routes')
@Controller('routes')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  @Post('plan')
  @Roles(PERMISSIONS.ROUTES.READ)
  plan(@Body() dto: RoutePlanRouteRequestDto) {
    return this.routeService.plan(dto);
  }

  @Post()
  @Roles(PERMISSIONS.ROUTES.CREATE)
  create(@Body() createRouteDto: CreateRouteRequestDto) {
    return this.routeService.create(createRouteDto);
  }

  @Get()
  @Roles(PERMISSIONS.ROUTES.READ)
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({
    name: 'driverId',
    required: false,
    description: 'Filter routes by driver ID',
  })
  @ApiQuery({
    name: 'vehicleId',
    required: false,
    description: 'Filter routes by vehicle ID',
  })
  findAll(
    @Query('branchId') branchId?: string,
    @Query('date') date?: string,
    @Query('driverId') driverId?: string,
    @Query('vehicleId') vehicleId?: string,
  ) {
    return this.routeService.findAll(branchId, date, driverId, vehicleId);
  }

  @Get(':id')
  @Roles(PERMISSIONS.ROUTES.READ)
  findOne(@Param('id') id: string) {
    return this.routeService.findOne(id);
  }

  @Put(':id/assign-vehicle')
  @Roles(PERMISSIONS.ROUTES.ASSIGN)
  assignVehicle(
    @Param('id') id: string,
    @Body() assignVehicleDto: AssignVehicleRequestDto,
  ) {
    return this.routeService.assignVehicle(id, assignVehicleDto);
  }

  @Put(':id/add-missions')
  @Roles(PERMISSIONS.ROUTES.CREATE)
  addMissions(
    @Param('id') id: string,
    @Body() addMissionsDto: AddMissionsRequestDto,
  ) {
    return this.routeService.addMissions(id, addMissionsDto);
  }
}
