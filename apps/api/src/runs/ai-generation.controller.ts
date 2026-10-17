import { Body, Controller, Post } from '@nestjs/common';
import { AiGenerationService } from './ai-generation.service.js';
import { parseGenerateAiInput } from './ai-generation.types.js';

@Controller('api/ai')
export class AiGenerationController {
  constructor(private readonly aiGenerationService: AiGenerationService) {}

  @Post('generate')
  generate(@Body() body: unknown) {
    return this.aiGenerationService.generate(parseGenerateAiInput(body));
  }
}
