import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsUUID } from 'class-validator';

export class VehicleDriverAssignmentResponseDto {
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

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  driverId!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  driver?: unknown;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  vehicleId!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  vehicle?: unknown;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiPropertyOptional()
  @Type(() => Date)
  @IsOptional()
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional()
  @Type(() => Date)
  @IsOptional()
  @IsDate()
  deletedAt?: Date;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  createdAt!: Date;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  updatedAt!: Date;
}
