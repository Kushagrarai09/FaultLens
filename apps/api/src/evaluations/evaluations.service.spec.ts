import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EvaluationsService } from './evaluations.service.js';

describe('EvaluationsService', () => {
  const query = vi.fn();
  let service: EvaluationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EvaluationsService({ query } as never);
  });

  it('validates prompt and dataset inputs before database writes', async () => {
    await expect(service.createPrompt({ name: '', model: 'qwen2.5:3b', template: 'Hi {{input}}' }))
      .rejects.toThrow(/name must be a non-empty string/);
    await expect(service.createDataset({ name: 'empty', cases: [] }))
      .rejects.toThrow(/between 1 and 50/);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects comparisons with fewer than two prompt versions', async () => {
    await expect(service.runComparison({ datasetId: 'c2a1f93b-9c72-4e4b-98b4-57d4bc8e30d9', promptVersionIds: [] }))
      .rejects.toThrow(/between 2 and 4/);
    expect(query).not.toHaveBeenCalled();
  });
});
