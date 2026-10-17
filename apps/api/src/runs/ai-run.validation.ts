import { BadRequestException } from '@nestjs/common';
import {
  AI_RUN_STATUSES,
  type AiRunStatus,
  type CreateAiRunInput,
} from './ai-run.types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOptionalTokenCount = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (Number.isInteger(value) && typeof value === 'number' && value >= 0);

export function parseCreateAiRunInput(value: unknown): CreateAiRunInput {
  if (!isRecord(value)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }

  const { provider, model, status, durationMs, inputTokens, outputTokens, errorCode, startedAt } = value;

  if (typeof provider !== 'string' || provider.trim().length === 0 || provider.length > 80) {
    throw new BadRequestException('provider must be a non-empty string of at most 80 characters.');
  }
  if (typeof model !== 'string' || model.trim().length === 0 || model.length > 160) {
    throw new BadRequestException('model must be a non-empty string of at most 160 characters.');
  }
  if (typeof status !== 'string' || !AI_RUN_STATUSES.includes(status as AiRunStatus)) {
    throw new BadRequestException('status must be either "success" or "failure".');
  }
  if (!Number.isInteger(durationMs) || typeof durationMs !== 'number' || durationMs < 0 || durationMs > 86_400_000) {
    throw new BadRequestException('durationMs must be an integer between 0 and 86400000.');
  }
  if (!isOptionalTokenCount(inputTokens) || !isOptionalTokenCount(outputTokens)) {
    throw new BadRequestException('Token counts must be non-negative integers or null.');
  }
  if (errorCode !== undefined && errorCode !== null && (typeof errorCode !== 'string' || errorCode.length > 120)) {
    throw new BadRequestException('errorCode must be a string of at most 120 characters or null.');
  }
  if (typeof startedAt !== 'string' || Number.isNaN(Date.parse(startedAt))) {
    throw new BadRequestException('startedAt must be a valid ISO-compatible date string.');
  }

  return {
    provider: provider.trim(),
    model: model.trim(),
    status: status as AiRunStatus,
    durationMs,
    inputTokens: inputTokens === undefined ? null : inputTokens as number | null,
    outputTokens: outputTokens === undefined ? null : outputTokens as number | null,
    errorCode: errorCode === undefined ? null : errorCode as string | null,
    startedAt: new Date(startedAt).toISOString(),
  };
}
