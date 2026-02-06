import { Module } from '@nestjs/common';
import { MissionController } from './mission.controller';
import { MissionRepository } from './mission.repository';
import { MissionService } from './mission.service';

@Module({
  controllers: [MissionController],
  providers: [MissionRepository, MissionService],
  exports: [MissionService, MissionRepository],
})
export class MissionModule {}
