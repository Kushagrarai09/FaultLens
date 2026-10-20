import { Injectable, type LoggerService } from '@nestjs/common';

type Level = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

const DATABASE_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^:/\s]+:[^@/\s]+@/gi;
const BEARER_CREDENTIALS = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const INLINE_SECRETS = /\b(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi;

export function redactLogMessage(value: string): string {
  return value
    .replace(DATABASE_CREDENTIALS, '$1[REDACTED]@')
    .replace(BEARER_CREDENTIALS, 'Bearer [REDACTED]')
    .replace(INLINE_SECRETS, '$1=[REDACTED]')
    .slice(0, 500);
}

@Injectable()
export class StructuredLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]) { this.write('info', message, optionalParams); }
  error(message: unknown, ...optionalParams: unknown[]) { this.write('error', message, optionalParams); }
  warn(message: unknown, ...optionalParams: unknown[]) { this.write('warn', message, optionalParams); }
  debug(message: unknown, ...optionalParams: unknown[]) { this.write('debug', message, optionalParams); }
  verbose(message: unknown, ...optionalParams: unknown[]) { this.write('debug', message, optionalParams); }
  fatal(message: unknown, ...optionalParams: unknown[]) { this.write('fatal', message, optionalParams); }

  private write(level: Level | 'info', message: unknown, optionalParams: unknown[]): void {
    // Never serialize exception objects, request bodies, headers, prompts, outputs,
    // tokens, or database details. The message string is redacted before emitting.
    const context = optionalParams.find((value) => typeof value === 'string');
    const safeMessage = typeof message === 'string'
      ? redactLogMessage(message)
      : '[non-string log message]';
    const encoded = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      context: typeof context === 'string' ? redactLogMessage(context).slice(0, 100) : 'FaultLens',
      message: safeMessage,
    });
    if (level === 'error' || level === 'fatal') process.stderr.write(encoded + '\n');
    else process.stdout.write(encoded + '\n');
  }
}
