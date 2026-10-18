import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

const METRICS = ['failure_rate_percent', 'p95_latency_ms', 'failed_runs'] as const;
type AlertMetric = (typeof METRICS)[number];
type DbRow = Record<string, string | number | boolean | Date | null>;
interface AlertRuleRow extends DbRow {
  id: string; name: string; metric: AlertMetric; threshold: string | number;
  window_minutes: number; enabled: boolean; created_at: Date; updated_at: Date;
}
interface MetricRow extends DbRow {
  sample_count: string; failed_runs: string; failure_rate_percent: string | null;
  p95_latency_ms: string | null;
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const positiveNumber = (value: unknown, field: string): number => {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1_000_000_000) {
    throw new BadRequestException(`${field} must be a positive number within the supported range.`);
  }
  return number;
};
const toRule = (row: AlertRuleRow) => ({
  id: row.id, name: row.name, metric: row.metric, threshold: Number(row.threshold),
  windowMinutes: row.window_minutes, enabled: row.enabled,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

@Injectable()
export class AlertsService {
  constructor(private readonly database: DatabaseService) {}

  async listRules() {
    const result = await this.database.query<AlertRuleRow>(
      'SELECT id, name, metric, threshold, window_minutes, enabled, created_at, updated_at FROM alert_rules ORDER BY created_at DESC LIMIT 100',
    );
    return { data: result.rows.map(toRule) };
  }

  async createRule(value: unknown) {
    if (!record(value)) throw new BadRequestException('Request body must be a JSON object.');
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 120) {
      throw new BadRequestException('name must be a non-empty string of at most 120 characters.');
    }
    if (typeof value.metric !== 'string' || !METRICS.includes(value.metric as AlertMetric)) {
      throw new BadRequestException(`metric must be one of: ${METRICS.join(', ')}.`);
    }
    const metric = value.metric as AlertMetric;
    const threshold = positiveNumber(value.threshold, 'threshold');
    if (metric === 'failure_rate_percent' && threshold > 100) {
      throw new BadRequestException('failure_rate_percent threshold cannot exceed 100.');
    }
    if (metric === 'failed_runs' && !Number.isInteger(threshold)) {
      throw new BadRequestException('failed_runs threshold must be a whole number.');
    }
    if (metric === 'p95_latency_ms' && threshold > 86_400_000) {
      throw new BadRequestException('p95_latency_ms threshold cannot exceed one day.');
    }
    const windowMinutes = value.windowMinutes;
    if (typeof windowMinutes !== 'number' || !Number.isInteger(windowMinutes) || windowMinutes < 5 || windowMinutes > 1440) {
      throw new BadRequestException('windowMinutes must be an integer between 5 and 1440.');
    }
    const result = await this.database.query<AlertRuleRow>(
      `INSERT INTO alert_rules (name, metric, threshold, window_minutes)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, metric, threshold, window_minutes, enabled, created_at, updated_at`,
      [value.name.trim(), metric, threshold, windowMinutes],
    );
    return toRule(result.rows[0]);
  }

  async updateRule(idValue: unknown, value: unknown) {
    const id = this.parseUuid(idValue);
    if (!record(value) || typeof value.enabled !== 'boolean') {
      throw new BadRequestException('Request body must include enabled as a boolean.');
    }
    const result = await this.database.query<AlertRuleRow>(
      `UPDATE alert_rules SET enabled = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, name, metric, threshold, window_minutes, enabled, created_at, updated_at`,
      [value.enabled, id],
    );
    if (!result.rows[0]) throw new NotFoundException('Alert rule was not found.');
    return toRule(result.rows[0]);
  }

  async evaluate() {
    const rulesResult = await this.database.query<AlertRuleRow>(
      'SELECT id, name, metric, threshold, window_minutes, enabled, created_at, updated_at FROM alert_rules WHERE enabled = TRUE ORDER BY created_at DESC LIMIT 100',
    );
    const alerts: Array<{
      rule: ReturnType<typeof toRule>;
      status: 'insufficient_data' | 'triggered' | 'normal';
      observedValue: number | null;
      sampleCount: number;
      failedRuns: number;
      evaluatedAt: string;
      message: string;
    }> = [];
    for (const rule of rulesResult.rows) {
      const metricResult = await this.database.query<MetricRow>(
        `SELECT COUNT(*)::text AS sample_count,
                COUNT(*) FILTER (WHERE status = 'failure')::text AS failed_runs,
                CASE WHEN COUNT(*) = 0 THEN NULL
                     ELSE (COUNT(*) FILTER (WHERE status = 'failure')::numeric * 100 / COUNT(*))::text
                END AS failure_rate_percent,
                percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)::text AS p95_latency_ms
         FROM ai_runs
         WHERE created_at >= NOW() - ($1::integer * INTERVAL '1 minute')`,
        [rule.window_minutes],
      );
      const metrics = metricResult.rows[0];
      const sampleCount = Number(metrics?.sample_count ?? 0);
      const failedRuns = Number(metrics?.failed_runs ?? 0);
      const value = rule.metric === 'failure_rate_percent'
        ? metrics?.failure_rate_percent == null ? null : Number(metrics.failure_rate_percent)
        : rule.metric === 'p95_latency_ms'
          ? metrics?.p95_latency_ms == null ? null : Number(metrics.p95_latency_ms)
          : failedRuns;
      const threshold = Number(rule.threshold);
      alerts.push({
        rule: toRule(rule),
        status: sampleCount === 0 ? 'insufficient_data' : value !== null && value >= threshold ? 'triggered' : 'normal',
        observedValue: value,
        sampleCount,
        failedRuns,
        evaluatedAt: new Date().toISOString(),
        message: sampleCount === 0
          ? 'No AI runs were recorded in this time window.'
          : value !== null && value >= threshold
            ? `${rule.name}: observed ${value} ${rule.metric}, meeting or exceeding threshold ${threshold}.`
            : `${rule.name}: observed value is below the configured threshold.`,
      });
    }
    return { generatedAt: new Date().toISOString(), data: alerts };
  }

  private parseUuid(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new BadRequestException('id must be a valid UUID.');
    }
    return value;
  }
}
