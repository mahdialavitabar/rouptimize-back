import { PartialType } from '@nestjs/swagger';
import { CreateVehicleDriverAssignmentRequestDto } from './create-vehicle-driver-assignment.request.dto';

export class UpdateVehicleDriverAssignmentRequestDto extends PartialType(
  CreateVehicleDriverAssignmentRequestDto,
) {}
