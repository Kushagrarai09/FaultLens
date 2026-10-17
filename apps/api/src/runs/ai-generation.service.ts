import { BadGatewayException, Injectable } from '@nestjs/common';
import { AiRunsService } from './ai-runs.service.js';
import type { AiRunRecord } from './ai-run.types.js';
import type { GenerateAiInput } from './ai-generation.types.js';

interface OllamaGenerateResponse {
  response?: unknown;
  done?: unknown;
  prompt_eval_count?: unknown;
  eval_count?: unknown;
}

@Injectable()
export class AiGenerationService {
  constructor(private readonly aiRunsService: AiRunsService) {}

  async generate(input: GenerateAiInput): Promise<{ response: string; run: AiRunRecord }> {
    const startedAt = new Date();
    const startedMs = Date.now();
    const baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');

    let upstream: Response;
    try {
      upstream = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: input.model, prompt: input.prompt, stream: false }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      const errorCode = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? 'OLLAMA_TIMEOUT'
        : 'OLLAMA_UNAVAILABLE';
      const run = await this.saveFailure(input.model, startedAt, startedMs, errorCode);
      throw new BadGatewayException({
        message: errorCode === 'OLLAMA_TIMEOUT'
          ? 'The local model did not respond within 60 seconds.'
          : 'Cannot reach Ollama. Check that Ollama is running and the selected model is available.',
        runId: run.id,
        errorCode,
      });
    }

    if (!upstream.ok) {
      const run = await this.saveFailure(input.model, startedAt, startedMs, 'OLLAMA_HTTP_ERROR');
      throw new BadGatewayException({
        message: 'Ollama returned an unsuccessful response. Check the model name and local Ollama logs.',
        runId: run.id,
        errorCode: 'OLLAMA_HTTP_ERROR',
      });
    }

    let result: OllamaGenerateResponse;
    try {
      result = await upstream.json() as OllamaGenerateResponse;
    } catch {
      const run = await this.saveFailure(input.model, startedAt, startedMs, 'OLLAMA_INVALID_RESPONSE');
      throw new BadGatewayException({
        message: 'Ollama returned a response FaultLens could not parse.',
        runId: run.id,
        errorCode: 'OLLAMA_INVALID_RESPONSE',
      });
    }

    if (typeof result.response !== 'string' || result.done !== true) {
      const run = await this.saveFailure(input.model, startedAt, startedMs, 'OLLAMA_INVALID_RESPONSE');
      throw new BadGatewayException({
        message: 'Ollama returned an incomplete or invalid generation result.',
        runId: run.id,
        errorCode: 'OLLAMA_INVALID_RESPONSE',
      });
    }

    const run = await this.aiRunsService.create({
      provider: 'ollama',
      model: input.model,
      status: 'success',
      durationMs: Math.min(Date.now() - startedMs, 86_400_000),
      inputTokens: this.asTokenCount(result.prompt_eval_count),
      outputTokens: this.asTokenCount(result.eval_count),
      errorCode: null,
      startedAt: startedAt.toISOString(),
    });

    return { response: result.response, run };
  }

  private async saveFailure(
    model: string,
    startedAt: Date,
    startedMs: number,
    errorCode: string,
  ): Promise<AiRunRecord> {
    return this.aiRunsService.create({
      provider: 'ollama',
      model,
      status: 'failure',
      durationMs: Math.min(Date.now() - startedMs, 86_400_000),
      inputTokens: null,
      outputTokens: null,
      errorCode,
      startedAt: startedAt.toISOString(),
    });
  }

  private asTokenCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : null;
  }
}
