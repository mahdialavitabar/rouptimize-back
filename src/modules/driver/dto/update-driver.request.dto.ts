import { PartialType } from '@nestjs/swagger';
import { CreateDriverRequestDto } from './create-driver.request.dto';

export class UpdateDriverRequestDto extends PartialType(
  CreateDriverRequestDto,
) {}
