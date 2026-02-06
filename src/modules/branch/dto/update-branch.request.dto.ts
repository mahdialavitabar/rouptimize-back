import { PartialType } from '@nestjs/swagger';
import { CreateBranchRequestDto } from './create-branch.request.dto';

export class UpdateBranchRequestDto extends PartialType(
  CreateBranchRequestDto,
) {}
