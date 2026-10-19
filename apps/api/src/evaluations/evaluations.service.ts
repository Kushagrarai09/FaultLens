import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

type DbRow = Record<string, string | number | Date | null>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, field: string, max: number): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new BadRequestException(`${field} must be a non-empty string of at most ${max} characters.`);
  }
  return value.trim();
};
const uuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${field} must be a valid UUID.`);
  }
  return value;
};
interface VersionRow extends DbRow {
  id: string; prompt_id: string; version: number; template: string;
  prompt_name: string; model: string; created_at: Date;
}
interface CaseRow extends DbRow { id: string; input: string; expected_output: string; }
interface OllamaResult {
  response?: unknown; done?: unknown; prompt_eval_count?: unknown; eval_count?: unknown;
}

@Injectable()
export class EvaluationsService {
  constructor(private readonly database: DatabaseService) {}

  async listPrompts() {
    const result = await this.database.query<DbRow & { id: string; name: string; model: string; created_at: Date }>(
      'SELECT id, name, model, created_at FROM prompt_templates ORDER BY created_at DESC LIMIT 100',
    );
    const prompts = await Promise.all(result.rows.map(async (prompt) => {
      const versions = await this.database.query<DbRow & { id: string; version: number; template: string; created_at: Date }>(
        'SELECT id, version, template, created_at FROM prompt_versions WHERE prompt_id = $1 ORDER BY version DESC',
        [prompt.id],
      );
      return { ...prompt, versions: versions.rows };
    }));
    return { data: prompts };
  }

  async createPrompt(value: unknown) {
    if (!isRecord(value)) throw new BadRequestException('Request body must be a JSON object.');
    const name = text(value.name, 'name', 120);
    const model = text(value.model, 'model', 160);
    const template = text(value.template, 'template', 12000);
    const result = await this.database.query<DbRow & { id: string; name: string; model: string; created_at: Date }>(
      'INSERT INTO prompt_templates (name, model) VALUES ($1, $2) RETURNING id, name, model, created_at',
      [name, model],
    );
    const prompt = result.rows[0];
    const versionResult = await this.database.query<DbRow & { id: string; prompt_id: string; version: number; template: string; created_at: Date }>(
      'INSERT INTO prompt_versions (prompt_id, version, template) VALUES ($1, 1, $2) RETURNING id, prompt_id, version, template, created_at',
      [prompt.id, template],
    );
    return { ...prompt, versions: [versionResult.rows[0]] };
  }

  async createVersion(promptIdValue: unknown, value: unknown) {
    const promptId = uuid(promptIdValue, 'promptId');
    if (!isRecord(value)) throw new BadRequestException('Request body must be a JSON object.');
    const template = text(value.template, 'template', 12000);
    const promptResult = await this.database.query<DbRow & { id: string }>(
      'SELECT id FROM prompt_templates WHERE id = $1', [promptId],
    );
    if (!promptResult.rows[0]) throw new NotFoundException('Prompt was not found.');
    const versionResult = await this.database.query<DbRow & { next_version: number }>(
      'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM prompt_versions WHERE prompt_id = $1', [promptId],
    );
    const version = Number(versionResult.rows[0]?.next_version ?? 1);
    return this.database.query<DbRow & { id: string; prompt_id: string; version: number; template: string; created_at: Date }>(
      'INSERT INTO prompt_versions (prompt_id, version, template) VALUES ($1, $2, $3) RETURNING id, prompt_id, version, template, created_at',
      [promptId, version, template],
    ).then((result) => result.rows[0]);
  }

  async listDatasets() {
    const result = await this.database.query<DbRow & { id: string; name: string; description: string; created_at: Date }>(
      'SELECT id, name, description, created_at FROM evaluation_datasets ORDER BY created_at DESC LIMIT 100',
    );
    const data = await Promise.all(result.rows.map(async (dataset) => {
      const cases = await this.database.query<DbRow & { id: string; input: string; expected_output: string }>(
        'SELECT id, input, expected_output FROM evaluation_cases WHERE dataset_id = $1 ORDER BY created_at ASC',
        [dataset.id],
      );
      return { ...dataset, caseCount: cases.rows.length, cases: cases.rows };
    }));
    return { data };
  }

  async createDataset(value: unknown) {
    if (!isRecord(value)) throw new BadRequestException('Request body must be a JSON object.');
    const name = text(value.name, 'name', 120);
    const description = value.description === undefined ? '' : typeof value.description === 'string' && value.description.length <= 500
      ? value.description.trim() : (() => { throw new BadRequestException('description must be a string of at most 500 characters.'); })();
    if (!Array.isArray(value.cases) || value.cases.length < 1 || value.cases.length > 50) {
      throw new BadRequestException('cases must contain between 1 and 50 test cases.');
    }
    const cases = value.cases.map((entry, index) => {
      if (!isRecord(entry)) throw new BadRequestException(`cases[${index}] must be an object.`);
      return {
        input: text(entry.input, `cases[${index}].input`, 12000),
        expectedOutput: text(entry.expectedOutput, `cases[${index}].expectedOutput`, 12000),
      };
    });
    const result = await this.database.query<DbRow & { id: string; name: string; description: string; created_at: Date }>(
      'INSERT INTO evaluation_datasets (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at',
      [name, description],
    );
    const dataset = result.rows[0];
    const inserted = [];
    for (const item of cases) {
      const saved = await this.database.query<DbRow & { id: string; input: string; expected_output: string }>(
        'INSERT INTO evaluation_cases (dataset_id, input, expected_output) VALUES ($1, $2, $3) RETURNING id, input, expected_output',
        [dataset.id, item.input, item.expectedOutput],
      );
      inserted.push(saved.rows[0]);
    }
    return { ...dataset, caseCount: inserted.length, cases: inserted };
  }

  async runComparison(value: unknown) {
    if (!isRecord(value)) throw new BadRequestException('Request body must be a JSON object.');
    const datasetId = uuid(value.datasetId, 'datasetId');
    if (!Array.isArray(value.promptVersionIds) || value.promptVersionIds.length < 2 || value.promptVersionIds.length > 4) {
      throw new BadRequestException('promptVersionIds must contain between 2 and 4 prompt version IDs.');
    }
    const versionIds = value.promptVersionIds.map((id, index) => uuid(id, `promptVersionIds[${index}]`));
    if (new Set(versionIds).size !== versionIds.length) throw new BadRequestException('Prompt version IDs must be unique.');

    const datasetResult = await this.database.query<DbRow & { id: string; name: string }>(
      'SELECT id, name FROM evaluation_datasets WHERE id = $1', [datasetId],
    );
    if (!datasetResult.rows[0]) throw new NotFoundException('Evaluation dataset was not found.');
    const casesResult = await this.database.query<CaseRow>(
      'SELECT id, input, expected_output FROM evaluation_cases WHERE dataset_id = $1 ORDER BY created_at ASC LIMIT 50',
      [datasetId],
    );
    if (!casesResult.rows.length) throw new BadRequestException('The selected dataset has no test cases.');

    const placeholders = versionIds.map((_, index) => `${index + 1}`).join(', ');
    const versionsResult = await this.database.query<VersionRow>(
      `SELECT v.id, v.prompt_id, v.version, v.template, v.created_at, p.name AS prompt_name, p.model
       FROM prompt_versions v JOIN prompt_templates p ON p.id = v.prompt_id
       WHERE v.id IN (${placeholders})`, versionIds,
    );
    const versionsById = new Map(versionsResult.rows.map((row) => [row.id, row]));
    const versions = versionIds.map((id) => versionsById.get(id)).filter((row): row is VersionRow => Boolean(row));
    if (versions.length !== versionIds.length) throw new NotFoundException('One or more prompt versions were not found.');

    const evalRun = await this.database.query<DbRow & { id: string }>(
      'INSERT INTO evaluation_runs (dataset_id, status, case_count) VALUES ($1, $2, $3) RETURNING id',
      [datasetId, 'partial', casesResult.rows.length * versions.length],
    );
    const evaluationRunId = evalRun.rows[0].id as string;
    const results: Array<Record<string, unknown>> = [];

    for (const version of versions) {
      for (const testCase of casesResult.rows) {
        const prompt = version.template.replace(/\{\{\s*input\s*\}\}/g, testCase.input);
        const started = Date.now();
        let status: 'success' | 'failure' = 'success';
        let score: number | null = null;
        let inputTokens: number | null = null;
        let outputTokens: number | null = null;
        let errorCode: string | null = null;
        const baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
        try {
          const response = await fetch(`${baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: version.model, prompt, stream: false }),
            signal: AbortSignal.timeout(60_000),
          });
          if (!response.ok) {
            status = 'failure'; errorCode = 'OLLAMA_HTTP_ERROR';
          } else {
            const body = await response.json() as OllamaResult;
            if (typeof body.response !== 'string' || body.done !== true) {
              status = 'failure'; errorCode = 'OLLAMA_INVALID_RESPONSE';
            } else {
              score = this.scoreResponse(body.response, testCase.expected_output);
              inputTokens = this.tokenCount(body.prompt_eval_count);
              outputTokens = this.tokenCount(body.eval_count);
            }
          }
        } catch (error) {
          status = 'failure';
          errorCode = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
            ? 'OLLAMA_TIMEOUT' : 'OLLAMA_UNAVAILABLE';
        }
        const durationMs = Math.min(Date.now() - started, 86_400_000);
        await this.database.query(
          `INSERT INTO evaluation_results
            (evaluation_run_id, prompt_version_id, model, status, score, duration_ms, input_tokens, output_tokens, error_code)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [evaluationRunId, version.id, version.model, status, score, durationMs, inputTokens, outputTokens, errorCode],
        );
        results.push({
          promptVersionId: version.id, promptName: version.prompt_name, version: version.version,
          model: version.model, caseId: testCase.id, status, score, durationMs,
          inputTokens, outputTokens, errorCode,
        });
      }
    }

    const successes = results.filter((item) => item.status === 'success').length;
    const failures = results.length - successes;
    const grouped = versions.map((version) => {
      const items = results.filter((item) => item.promptVersionId === version.id);
      const good = items.filter((item) => item.status === 'success');
      const scores = good.map((item) => item.score).filter((item): item is number => typeof item === 'number');
      const durations = good.map((item) => item.durationMs as number);
      const tokenIn = good.map((item) => item.inputTokens).filter((item): item is number => typeof item === 'number');
      const tokenOut = good.map((item) => item.outputTokens).filter((item): item is number => typeof item === 'number');
      return {
        promptVersionId: version.id, promptName: version.prompt_name, version: version.version,
        model: version.model, totalCases: items.length, successfulCases: good.length,
        failedCases: items.length - good.length,
        averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100) / 100 : null,
        averageLatencyMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
        totalInputTokens: tokenIn.length ? tokenIn.reduce((a, b) => a + b, 0) : null,
        totalOutputTokens: tokenOut.length ? tokenOut.reduce((a, b) => a + b, 0) : null,
      };
    });

    const finalStatus = failures === 0 ? 'completed' : successes === 0 ? 'failed' : 'partial';
    await this.database.query('UPDATE evaluation_runs SET status = $1 WHERE id = $2', [finalStatus, evaluationRunId]);
    return {
      id: evaluationRunId, dataset: datasetResult.rows[0], status: finalStatus,
      completedCases: successes, failedCases: failures,
      scoreMethod: 'case-insensitive token overlap against expected output; heuristic, not an LLM judge',
      summary: grouped, results,
    };
  }

  async getEvaluation(idValue: unknown) {
    const id = uuid(idValue, 'evaluationId');
    const runResult = await this.database.query<DbRow & { id: string; dataset_id: string; status: string; case_count: number; created_at: Date }>(
      'SELECT id, dataset_id, status, case_count, created_at FROM evaluation_runs WHERE id = $1', [id],
    );
    if (!runResult.rows[0]) throw new NotFoundException('Evaluation run was not found.');
    const resultRows = await this.database.query<DbRow>(
      'SELECT prompt_version_id, model, status, score, duration_ms, input_tokens, output_tokens, error_code, created_at FROM evaluation_results WHERE evaluation_run_id = $1 ORDER BY created_at ASC',
      [id],
    );
    return { ...runResult.rows[0], results: resultRows.rows };
  }

  private scoreResponse(response: string, expected: string): number {
    const tokens = (value: string) => new Set(
      value.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 1) ?? [],
    );
    const target = tokens(expected);
    if (!target.size) return response.trim() ? 100 : 0;
    const actual = tokens(response);
    let overlap = 0;
    for (const token of target) if (actual.has(token)) overlap += 1;
    return Math.round(overlap / target.size * 10000) / 100;
  }

  private tokenCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
}
