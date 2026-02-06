import { Module } from '@nestjs/common';
import { DriverController } from './driver.controller';
import { DriverRepository } from './driver.repository';
import { DriverService } from './driver.service';

@Module({
  providers: [DriverRepository, DriverService],
  controllers: [DriverController],
  exports: [DriverService],
})
export class DriverModule {}
