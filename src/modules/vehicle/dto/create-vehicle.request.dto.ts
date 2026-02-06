import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export class CreateVehicleRequestDto {
  @ApiProperty()
  @IsString()
  vin!: string;

  @ApiProperty()
  @IsString()
  plateNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'HH:mm' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startWorkingTime must be in HH:mm format',
  })
  startWorkingTime?: string;

  @ApiPropertyOptional({ description: 'HH:mm' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endWorkingTime must be in HH:mm format',
  })
  endWorkingTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weightCapacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  volumeCapacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  missionCapacity?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Numeric string', example: '0.25' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'costPerKm must be numeric string' })
  costPerKm?: string;

  @ApiPropertyOptional({ description: 'Numeric string', example: '5' })
  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'costPerHour must be numeric string' })
  costPerHour?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startPoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endPoint?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'maintenance'] })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'maintenance'])
  status?: 'active' | 'inactive' | 'maintenance';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;
}
