import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class VehicleResponseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

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
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startWorkingTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endWorkingTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  weightCapacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  volumeCapacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  missionCapacity?: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  skills!: string[];

  @ApiProperty()
  @IsString()
  costPerKm!: string;

  @ApiProperty()
  @IsString()
  costPerHour!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startPoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endPoint?: string;

  @ApiProperty({ enum: ['active', 'inactive', 'maintenance'] })
  @IsEnum(['active', 'inactive', 'maintenance'])
  status!: 'active' | 'inactive' | 'maintenance';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  companyId!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  company?: unknown;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  branch?: unknown;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  assignments?: unknown[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  createdById?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  createdBy?: unknown;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  createdAt!: Date;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  updatedAt!: Date;

  @ApiPropertyOptional()
  @Type(() => Date)
  @IsOptional()
  @IsDate()
  deletedAt?: Date;
}
