import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { AiRunsService } from './ai-runs.service.js';
import { parseCreateAiRunInput } from './ai-run.validation.js';

@Controller('api/runs')
export class AiRunsController {
  constructor(private readonly aiRunsService: AiRunsService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.aiRunsService.create(parseCreateAiRunInput(body));
  }

  @Get()
  list(@Query('limit') limitValue?: string, @Query('offset') offsetValue?: string) {
    const limit = this.parseIntegerQuery(limitValue, 'limit', 20, 1, 100);
    const offset = this.parseIntegerQuery(offsetValue, 'offset', 0, 0, 1_000_000);
    return this.aiRunsService.list(limit, offset);
  }

  @Get(':id')
  findById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.aiRunsService.findById(id);
  }

  private parseIntegerQuery(
    value: string | undefined,
    name: string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    if (value === undefined) return fallback;
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(`${name} must be a whole number.`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
      throw new BadRequestException(`${name} must be between ${min} and ${max}.`);
    }
    return parsed;
  }
}
