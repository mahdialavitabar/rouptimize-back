import { Module } from '@nestjs/common';
import { VehicleDriverAssignmentController } from './vehicle-driver-assignment.controller';
import { VehicleDriverAssignmentRepository } from './vehicle-driver-assignment.repository';
import { VehicleDriverAssignmentService } from './vehicle-driver-assignment.service';

@Module({
  controllers: [VehicleDriverAssignmentController],
  providers: [
    VehicleDriverAssignmentRepository,
    VehicleDriverAssignmentService,
  ],
  exports: [VehicleDriverAssignmentService, VehicleDriverAssignmentRepository],
})
export class VehicleDriverAssignmentModule {}
