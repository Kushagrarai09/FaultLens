import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AiRunsModule } from './runs/ai-runs.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, AiRunsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
