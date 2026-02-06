import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { MissionStatus } from './mission-status.enum';

export class MissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  companyId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: '2025-01-31' })
  @IsDateString()
  date!: string;

  @ApiProperty()
  @IsString()
  customerName!: string;

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiProperty()
  @IsString()
  address!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  routeId?: string;

  @ApiProperty()
  @IsNumber()
  latitude!: number;

  @ApiProperty()
  @IsNumber()
  longitude!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  deliveryTime!: string | null;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  startTimeWindow!: Date;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  endTimeWindow!: Date;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driverName?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vehiclePlate?: string;

  @ApiProperty({ enum: MissionStatus })
  @IsEnum(MissionStatus)
  status!: MissionStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  createdById?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  company?: unknown;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  branch?: unknown;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  route?: unknown;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  assignment?: unknown;

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
}
