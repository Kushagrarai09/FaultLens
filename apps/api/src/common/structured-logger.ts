import { ConsoleLogger, Injectable, type LogLevel } from '@nestjs/common';

const SECRET_KEYS = /authorization|cookie|password|secret|token|api.?key|prompt|response|body|query|connection|string/i;
const URL_CREDENTIALS = /:\/\/([^:/\s]+):([^@/\s]+)@/g;

const sanitize = (value: unknown, key = ''): unknown => {
  if (SECRET_KEYS.test(key)) return '[REDACTED]';
  if (typeof value === 'string') {
    return value.replace(URL_CREDENTIALS, '://[REDACTED]@').slice(0, 2_000);
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      result[childKey] = sanitize(childValue, childKey);
    }
    return result;
  }
  return value;
};

@Injectable()
export class StructuredLogger extends ConsoleLogger {
  protected printMessages(
    messages: unknown[],
    context?: string,
    logLevel?: LogLevel,
    writeStreamType?: 'stdout' | 'stderr',
  ) {
    const record = {
      timestamp: new Date().toISOString(),
      level: logLevel ?? 'log',
      context: context ?? this.context ?? 'FaultLensAPI',
      messages: sanitize(messages),
      service: 'faultlens-api',
    };
    const output = JSON.stringify(record);
    if (writeStreamType === 'stderr' || logLevel === 'error' || logLevel === 'fatal' || logLevel === 'warn') {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }
}

export { sanitize as sanitizeLogValue };
