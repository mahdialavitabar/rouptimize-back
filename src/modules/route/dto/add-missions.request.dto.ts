import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AddMissionsRequestDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @IsUUID(undefined, { each: true })
  missionIds!: string[];
}
