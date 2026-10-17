import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from './analytics.service.js';

describe('AnalyticsService', () => {
  const query = vi.fn();
  let service: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyticsService({ query } as never);
  });

  it('calculates rates, preserves unknown cost, and maps model breakdowns', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          total_runs: '4',
          successful_runs: '3',
          failed_runs: '1',
          average_duration_ms: '500',
          p50_duration_ms: '350',
          p95_duration_ms: '900',
          input_tokens: '100',
          output_tokens: '60',
          runs_with_input_tokens: '3',
          runs_with_output_tokens: '3',
          distinct_models: '2',
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          provider: 'ollama',
          model: 'qwen2.5:3b',
          total_runs: '4',
          successful_runs: '3',
          failed_runs: '1',
          average_duration_ms: '500',
          p95_duration_ms: '900',
          input_tokens: '100',
          output_tokens: '60',
        }],
      });

    const result = await service.getSummary();

    expect(result.totals).toEqual({
      totalRuns: 4,
      successfulRuns: 3,
      failedRuns: 1,
      successRatePercent: 75,
      failureRatePercent: 25,
      distinctModels: 2,
    });
    expect(result.latencyMs).toEqual({ average: 500, p50: 350, p95: 900 });
    expect(result.tokens).toEqual({
      input: 100,
      output: 60,
      total: 160,
      runsWithInputTokenData: 3,
      runsWithOutputTokenData: 3,
    });
    expect(result.cost.available).toBe(false);
    expect(result.cost.estimatedUsd).toBeNull();
    expect(result.byModel[0]).toMatchObject({
      provider: 'ollama',
      model: 'qwen2.5:3b',
      totalRuns: 4,
      successRatePercent: 75,
    });
  });

  it('returns null rates and latency when no runs exist', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          total_runs: '0',
          successful_runs: '0',
          failed_runs: '0',
          average_duration_ms: null,
          p50_duration_ms: null,
          p95_duration_ms: null,
          input_tokens: null,
          output_tokens: null,
          runs_with_input_tokens: '0',
          runs_with_output_tokens: '0',
          distinct_models: '0',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.getSummary();

    expect(result.totals.successRatePercent).toBeNull();
    expect(result.latencyMs).toEqual({ average: null, p50: null, p95: null });
    expect(result.tokens.total).toBeNull();
    expect(result.byModel).toEqual([]);
  });
});
