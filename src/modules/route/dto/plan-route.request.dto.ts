import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class RoutePlanRouteRequestDto {
  @ApiProperty({ example: '2025-01-31' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: ['uuid1', 'uuid2'] })
  @IsArray()
  @IsUUID('4', { each: true })
  missionIds!: string[];

  @ApiPropertyOptional({ enum: ['manual', 'auto'] })
  @IsOptional()
  @IsIn(['manual', 'auto'])
  mode?: 'manual' | 'auto';
}
