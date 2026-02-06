import { Module } from '@nestjs/common';
import { MissionModule } from '../mission/mission.module';
import { VehicleDriverAssignmentModule } from '../vehicle-driver-assignment/vehicle-driver-assignment.module';
import { RouteController } from './route.controller';
import { RouteRepository } from './route.repository';
import { RouteService } from './route.service';

@Module({
  imports: [MissionModule, VehicleDriverAssignmentModule],
  controllers: [RouteController],
  providers: [RouteService, RouteRepository],
  exports: [RouteService],
})
export class RouteModule {}
