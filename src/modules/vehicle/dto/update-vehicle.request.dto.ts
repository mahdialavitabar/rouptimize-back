import { PartialType } from '@nestjs/swagger';
import { CreateVehicleRequestDto } from './create-vehicle.request.dto';

export class UpdateVehicleRequestDto extends PartialType(
  CreateVehicleRequestDto,
) {}
