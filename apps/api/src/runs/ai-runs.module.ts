import { Module } from '@nestjs/common';
import { AnalyticsController } from '../analytics/analytics.controller.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { EvaluationsController } from '../evaluations/evaluations.controller.js';
import { EvaluationsService } from '../evaluations/evaluations.service.js';
import { AlertsController } from '../alerts/alerts.controller.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { AiRunsController } from './ai-runs.controller.js';
import { AiGenerationController } from './ai-generation.controller.js';
import { AiGenerationService } from './ai-generation.service.js';
import { AiRunsService } from './ai-runs.service.js';

@Module({
  controllers: [AiRunsController, AiGenerationController, AnalyticsController, EvaluationsController, AlertsController],
  providers: [AiRunsService, AiGenerationService, AnalyticsService, EvaluationsService, AlertsService],
})
export class AiRunsModule {}
