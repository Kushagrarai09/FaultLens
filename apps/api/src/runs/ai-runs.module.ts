import { Module } from '@nestjs/common';
import { AiRunsController } from './ai-runs.controller.js';
import { AiGenerationController } from './ai-generation.controller.js';
import { AiGenerationService } from './ai-generation.service.js';
import { AiRunsService } from './ai-runs.service.js';

@Module({
  controllers: [AiRunsController, AiGenerationController],
  providers: [AiRunsService, AiGenerationService],
})
export class AiRunsModule {}
