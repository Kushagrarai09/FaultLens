import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

interface SummaryRow {
  total_runs: string;
  successful_runs: string;
  failed_runs: string;
  average_duration_ms: string | null;
  p50_duration_ms: string | null;
  p95_duration_ms: string | null;
  input_tokens: string | null;
  output_tokens: string | null;
  runs_with_input_tokens: string;
  runs_with_output_tokens: string;
  distinct_models: string;
}

interface ModelRow {
  provider: string;
  model: string;
  total_runs: string;
  successful_runs: string;
  failed_runs: string;
  average_duration_ms: string | null;
  p95_duration_ms: string | null;
  input_tokens: string | null;
  output_tokens: string | null;
}

const count = (value: string | number | null | undefined): number =>
  value == null ? 0 : Number(value);

const nullableNumber = (value: string | number | null | undefined): number | null =>
  value == null ? null : Number(value);

@Injectable()
export class AnalyticsService {
  constructor(private readonly database: DatabaseService) {}

  async getSummary(workspaceId: string) {
    const [summaryResult, modelResult] = await Promise.all([
      this.database.query<SummaryRow>(`
        SELECT
          COUNT(*)::text AS total_runs,
          COUNT(*) FILTER (WHERE status = 'success')::text AS successful_runs,
          COUNT(*) FILTER (WHERE status = 'failure')::text AS failed_runs,
          ROUND(AVG(duration_ms))::text AS average_duration_ms,
          ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms))::text AS p50_duration_ms,
          ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::text AS p95_duration_ms,
          SUM(input_tokens)::text AS input_tokens,
          SUM(output_tokens)::text AS output_tokens,
          COUNT(input_tokens)::text AS runs_with_input_tokens,
          COUNT(output_tokens)::text AS runs_with_output_tokens,
          COUNT(DISTINCT model)::text AS distinct_models
        FROM ai_runs
        WHERE workspace_id = $1
      `, [workspaceId]),
      this.database.query<ModelRow>(`
        SELECT
          provider,
          model,
          COUNT(*)::text AS total_runs,
          COUNT(*) FILTER (WHERE status = 'success')::text AS successful_runs,
          COUNT(*) FILTER (WHERE status = 'failure')::text AS failed_runs,
          ROUND(AVG(duration_ms))::text AS average_duration_ms,
          ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms))::text AS p95_duration_ms,
          SUM(input_tokens)::text AS input_tokens,
          SUM(output_tokens)::text AS output_tokens
        FROM ai_runs
        WHERE workspace_id = $1
        GROUP BY provider, model
        ORDER BY COUNT(*) DESC, provider ASC, model ASC
        LIMIT 20
      `, [workspaceId]),
    ]);

    const row = summaryResult.rows[0];
    const totalRuns = count(row?.total_runs);
    const successfulRuns = count(row?.successful_runs);
    const failedRuns = count(row?.failed_runs);
    const inputTokenRuns = count(row?.runs_with_input_tokens);
    const outputTokenRuns = count(row?.runs_with_output_tokens);

    return {
      generatedAt: new Date().toISOString(),
      scope: 'current_workspace',
      totals: {
        totalRuns,
        successfulRuns,
        failedRuns,
        successRatePercent: totalRuns ? Math.round((successfulRuns / totalRuns) * 10000) / 100 : null,
        failureRatePercent: totalRuns ? Math.round((failedRuns / totalRuns) * 10000) / 100 : null,
        distinctModels: count(row?.distinct_models),
      },
      latencyMs: {
        average: nullableNumber(row?.average_duration_ms),
        p50: nullableNumber(row?.p50_duration_ms),
        p95: nullableNumber(row?.p95_duration_ms),
      },
      tokens: {
        input: nullableNumber(row?.input_tokens),
        output: nullableNumber(row?.output_tokens),
        total: row?.input_tokens == null && row?.output_tokens == null
          ? null
          : count(row?.input_tokens) + count(row?.output_tokens),
        runsWithInputTokenData: inputTokenRuns,
        runsWithOutputTokenData: outputTokenRuns,
      },
      cost: {
        estimatedUsd: null,
        available: false,
        reason: 'No verified pricing configuration is available for the recorded provider/model combination.',
      },
      byModel: modelResult.rows.map((model) => ({
        provider: model.provider,
        model: model.model,
        totalRuns: count(model.total_runs),
        successfulRuns: count(model.successful_runs),
        failedRuns: count(model.failed_runs),
        successRatePercent: count(model.total_runs)
          ? Math.round((count(model.successful_runs) / count(model.total_runs)) * 10000) / 100
          : null,
        averageLatencyMs: nullableNumber(model.average_duration_ms),
        p95LatencyMs: nullableNumber(model.p95_duration_ms),
        inputTokens: nullableNumber(model.input_tokens),
        outputTokens: nullableNumber(model.output_tokens),
      })),
    };
  }
}
