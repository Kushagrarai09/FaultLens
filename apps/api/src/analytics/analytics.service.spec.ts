import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from './analytics.service.js';

describe('AnalyticsService', () => {
  const query = vi.fn();
  let service: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyticsService({ query } as never);
  });

  it('calculates rates, latency percentiles, and token usage from numeric PostgreSQL results', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        total_runs: '4', successful_runs: '3', failed_runs: '1',
        average_duration_ms: '500', p50_duration_ms: '350', p95_duration_ms: '900',
        input_tokens: '100', output_tokens: '60', runs_with_input_tokens: '3',
        runs_with_output_tokens: '3', distinct_models: '2',
      }] })
      .mockResolvedValueOnce({ rows: [{
        provider: 'ollama', model: 'qwen2.5:3b', total_runs: '4',
        successful_runs: '3', failed_runs: '1', average_duration_ms: '500',
        p95_duration_ms: '900', input_tokens: '100', output_tokens: '60',
      }] });

    const result = await service.getSummary();
    expect(result.totals).toMatchObject({
      totalRuns: 4, successfulRuns: 3, failedRuns: 1, successRatePercent: 75,
      failureRatePercent: 25, distinctModels: 2,
    });
    expect(result.latencyMs).toEqual({ average: 500, p50: 350, p95: 900 });
    expect(result.tokens).toEqual({
      input: 100, output: 60, total: 160,
      runsWithInputTokenData: 3, runsWithOutputTokenData: 3,
    });
    expect(result.cost).toMatchObject({ available: false, estimatedUsd: null });
    expect(result.byModel[0]).toMatchObject({
      provider: 'ollama', model: 'qwen2.5:3b', totalRuns: 4, successRatePercent: 75,
    });
    expect(query.mock.calls[0][0]).toContain('AVG(duration_ms)');
    expect(query.mock.calls[0][0]).toContain('percentile_cont(0.50)');
    expect(query.mock.calls[0][0]).toContain('percentile_cont(0.95)');
  });

  it('returns null rates and percentiles for an empty database instead of misleading zeroes', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        total_runs: '0', successful_runs: '0', failed_runs: '0',
        average_duration_ms: null, p50_duration_ms: null, p95_duration_ms: null,
        input_tokens: null, output_tokens: null, runs_with_input_tokens: '0',
        runs_with_output_tokens: '0', distinct_models: '0',
      }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.getSummary();
    expect(result.totals.successRatePercent).toBeNull();
    expect(result.totals.failureRatePercent).toBeNull();
    expect(result.latencyMs).toEqual({ average: null, p50: null, p95: null });
    expect(result.tokens).toEqual({
      input: null, output: null, total: null,
      runsWithInputTokenData: 0, runsWithOutputTokenData: 0,
    });
    expect(result.byModel).toEqual([]);
  });

  it('preserves unknown input token data when output usage alone is available', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        total_runs: '2', successful_runs: '2', failed_runs: '0',
        average_duration_ms: '100', p50_duration_ms: '100', p95_duration_ms: '100',
        input_tokens: null, output_tokens: '25', runs_with_input_tokens: '0',
        runs_with_output_tokens: '1', distinct_models: '1',
      }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.getSummary();
    expect(result.tokens.input).toBeNull();
    expect(result.tokens.output).toBe(25);
    expect(result.tokens.total).toBe(25);
    expect(result.tokens.runsWithInputTokenData).toBe(0);
    expect(result.tokens.runsWithOutputTokenData).toBe(1);
  });

  it('computes success rate as a percentage rounded to two decimal places', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        total_runs: '3', successful_runs: '2', failed_runs: '1',
        average_duration_ms: '10', p50_duration_ms: '10', p95_duration_ms: '10',
        input_tokens: '0', output_tokens: '0', runs_with_input_tokens: '3',
        runs_with_output_tokens: '3', distinct_models: '1',
      }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await service.getSummary();
    expect(result.totals.successRatePercent).toBe(66.67);
    expect(result.totals.failureRatePercent).toBe(33.33);
  });
});
