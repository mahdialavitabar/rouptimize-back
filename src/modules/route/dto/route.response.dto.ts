import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

import { MissionResponseDto } from '../../mission/dto/mission.response.dto';
import { UserResponseDto } from '../../user/dto/user.response.dto';
import { VehicleResponseDto } from '../../vehicle/dto/vehicle.response.dto';

export enum RouteStatus {
  DRAFT = 'draft',
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  DELAYED = 'delayed',
}

export class RouteResponseDto {
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

  @ApiProperty({ description: 'Human-friendly route name' })
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Optional route description/notes' })
  @IsString()
  description!: string;

  @ApiProperty({ enum: RouteStatus })
  @IsEnum(RouteStatus)
  status!: RouteStatus;

  @ApiPropertyOptional()
  @IsOptional()
  geometry?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  totalDistanceMeters?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  totalDurationSeconds?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiPropertyOptional({ type: [MissionResponseDto] })
  @IsOptional()
  @IsArray()
  missions?: MissionResponseDto[];

  @ApiPropertyOptional({ type: VehicleResponseDto })
  @IsOptional()
  @IsObject()
  vehicle?: VehicleResponseDto;

  @ApiPropertyOptional({ type: UserResponseDto })
  @IsOptional()
  @IsObject()
  driver?: UserResponseDto;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  createdAt!: Date;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  updatedAt!: Date;
}
