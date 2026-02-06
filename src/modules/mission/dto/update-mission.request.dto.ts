import { PartialType } from '@nestjs/swagger';
import { CreateMissionRequestDto } from './create-mission.request.dto';

export class UpdateMissionRequestDto extends PartialType(
  CreateMissionRequestDto,
) {}
