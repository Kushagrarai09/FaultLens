import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { EvaluationsService } from './evaluations.service.js';

@Controller('api')
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Get('prompts')
  listPrompts() { return this.evaluationsService.listPrompts(); }

  @Post('prompts')
  createPrompt(@Body() body: unknown) { return this.evaluationsService.createPrompt(body); }

  @Post('prompts/:id/versions')
  createVersion(@Param('id') id: string, @Body() body: unknown) {
    return this.evaluationsService.createVersion(id, body);
  }

  @Get('datasets')
  listDatasets() { return this.evaluationsService.listDatasets(); }

  @Post('datasets')
  createDataset(@Body() body: unknown) { return this.evaluationsService.createDataset(body); }

  @Post('evaluations')
  runComparison(@Body() body: unknown) { return this.evaluationsService.runComparison(body); }

  @Get('evaluations/:id')
  getEvaluation(@Param('id') id: string) { return this.evaluationsService.getEvaluation(id); }
}
