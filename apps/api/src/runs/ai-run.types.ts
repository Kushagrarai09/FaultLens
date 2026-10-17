export const AI_RUN_STATUSES = ['success', 'failure'] as const;

export type AiRunStatus = (typeof AI_RUN_STATUSES)[number];

export interface CreateAiRunInput {
  provider: string;
  model: string;
  status: AiRunStatus;
  durationMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorCode?: string | null;
  startedAt: string;
}

export interface AiRunRecord {
  id: string;
  provider: string;
  model: string;
  status: AiRunStatus;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorCode: string | null;
  startedAt: string;
  createdAt: string;
}
