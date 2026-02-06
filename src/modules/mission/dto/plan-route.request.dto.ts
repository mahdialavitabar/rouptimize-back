import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class MissionPlanRouteRequestDto {
  @ApiPropertyOptional({ example: '2025-01-31' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ enum: ['manual', 'auto'] })
  @IsOptional()
  @IsIn(['manual', 'auto'])
  mode?: 'manual' | 'auto';

  @ApiPropertyOptional({
    description: 'Optional array of mission IDs to optimize (subset)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  missionIds?: string[];

  @ApiPropertyOptional({ description: 'Optional branch filter' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
