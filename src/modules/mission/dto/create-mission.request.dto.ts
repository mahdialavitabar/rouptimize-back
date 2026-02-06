import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { MissionStatus } from './mission-status.enum';

export class CreateMissionRequestDto {
  @ApiProperty({ example: '2025-01-31' })
  @IsDateString()
  @IsNotEmpty()
  date!: string;

  @ApiProperty({ description: 'Customer name' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: '+15551234567' })
  @IsPhoneNumber()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiProperty({
    description: 'Longitude,Latitude as "lng,lat"',
    example: '51.3890,35.6892',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/, {
    message: 'location must be in "lng,lat" format',
  })
  location!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryTime?: string;

  @ApiPropertyOptional({ description: 'HH:mm' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTimeWindow must be in HH:mm format',
  })
  startTimeWindow?: string;

  @ApiPropertyOptional({ description: 'HH:mm' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTimeWindow must be in HH:mm format',
  })
  endTimeWindow?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID(undefined, { message: 'vehicleId must be a UUID or null' })
  vehicleId?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Set to true to clear vehicle assignment',
  })
  @IsOptional()
  clearVehicle?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ enum: MissionStatus })
  @IsOptional()
  @IsEnum(MissionStatus)
  status?: MissionStatus;
}
