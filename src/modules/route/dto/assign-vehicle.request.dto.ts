import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignVehicleRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vehicleId!: string;
}
