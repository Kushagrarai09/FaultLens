import { BadRequestException } from '@nestjs/common';

export interface GenerateAiInput {
  model: string;
  prompt: string;
}

export function parseGenerateAiInput(value: unknown): GenerateAiInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const body = value as Record<string, unknown>;
  if (typeof body.model !== 'string' || !body.model.trim() || body.model.length > 160) {
    throw new BadRequestException('model must be a non-empty string of at most 160 characters.');
  }
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 12_000) {
    throw new BadRequestException('prompt must be a non-empty string of at most 12000 characters.');
  }

  return { model: body.model.trim(), prompt: body.prompt.trim() };
}
