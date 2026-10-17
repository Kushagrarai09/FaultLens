import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertsService } from './alerts.service.js';

describe('AlertsService', () => {
  const query = vi.fn();
  let service: AlertsService;
  beforeEach(() => { vi.clearAllMocks(); service = new AlertsService({ query } as never); });

  it('rejects unsupported metrics and invalid thresholds before writing', async () => {
    await expect(service.createRule({ name: 'Bad metric', metric: 'made_up', threshold: 1, windowMinutes: 5 }))
      .rejects.toThrow(/metric must be one of/);
    await expect(service.createRule({ name: 'Failure rate', metric: 'failure_rate_percent', threshold: 101, windowMinutes: 5 }))
      .rejects.toThrow(/cannot exceed 100/);
    await expect(service.createRule({ name: 'Latency', metric: 'p95_latency_ms', threshold: 300, windowMinutes: 2 }))
      .rejects.toThrow(/between 5 and 1440/);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a non-integer failed-run threshold', async () => {
    await expect(service.createRule({ name: 'Failures', metric: 'failed_runs', threshold: 1.5, windowMinutes: 5 }))
      .rejects.toThrow(/whole number/);
    expect(query).not.toHaveBeenCalled();
  });

  it('requires a boolean when enabling or disabling a rule', async () => {
    await expect(service.updateRule('c2a1f93b-9c72-4e4b-98b4-57d4bc8e30d9', { enabled: 'yes' }))
      .rejects.toThrow(/enabled as a boolean/);
    expect(query).not.toHaveBeenCalled();
  });
});
