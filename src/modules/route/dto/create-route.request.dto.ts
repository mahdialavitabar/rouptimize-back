import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateRouteRequestDto {
  @ApiProperty({ example: '2025-01-31' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ description: 'Human-friendly route name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Optional route description/notes' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  missionIds!: string[];
}
