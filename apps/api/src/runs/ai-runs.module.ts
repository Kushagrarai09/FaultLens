import { Module } from '@nestjs/common';
import { AiRunsController } from './ai-runs.controller.js';
import { AiRunsService } from './ai-runs.service.js';

@Module({
  controllers: [AiRunsController],
  providers: [AiRunsService],
})
export class AiRunsModule {}
