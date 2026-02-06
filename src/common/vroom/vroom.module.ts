import { Global, Module } from '@nestjs/common';
import { VroomService } from './vroom.service';

@Global()
@Module({
  providers: [VroomService],
  exports: [VroomService],
})
export class VroomModule {}
