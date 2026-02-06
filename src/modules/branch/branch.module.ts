import { Module } from '@nestjs/common';
import { BranchController } from './branch.controller';
import { BranchRepository } from './branch.repository';
import { BranchService } from './branch.service';

@Module({
  providers: [BranchRepository, BranchService],
  controllers: [BranchController],
})
export class BranchModule {}
