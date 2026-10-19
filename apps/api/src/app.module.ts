import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AiRunsModule } from './runs/ai-runs.module.js';
import { HealthModule } from './health/health.module.js';
import { ApiRateLimitGuard } from './security/api-rate-limit.guard.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, AiRunsModule, HealthModule],
  controllers: [AppController],
  providers: [AppService, ApiRateLimitGuard],
  exports: [ApiRateLimitGuard],
})
export class AppModule {}
