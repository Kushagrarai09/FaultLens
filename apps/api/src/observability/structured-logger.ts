import { Injectable, type LoggerService } from '@nestjs/common';

type Level = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

@Injectable()
export class StructuredLogger implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]) { this.write('info', message, optionalParams); }
  error(message: unknown, ...optionalParams: unknown[]) { this.write('error', message, optionalParams); }
  warn(message: unknown, ...optionalParams: unknown[]) { this.write('warn', message, optionalParams); }
  debug(message: unknown, ...optionalParams: unknown[]) { this.write('debug', message, optionalParams); }
  verbose(message: unknown, ...optionalParams: unknown[]) { this.write('debug', message, optionalParams); }
  fatal(message: unknown, ...optionalParams: unknown[]) { this.write('fatal', message, optionalParams); }

  private write(level: Level | 'info', message: unknown, optionalParams: unknown[]): void {
    // Deliberately log only message strings and Nest context; never log request bodies,
    // headers, prompts, model outputs, exception objects, tokens, or connection strings.
    const context = optionalParams.find((value) => typeof value === 'string');
    const safeMessage = typeof message === 'string' ? message.slice(0, 500) : '[non-string log message]';
    const encoded = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      context: typeof context === 'string' ? context.slice(0, 100) : 'FaultLens',
      message: safeMessage,
    });
    if (level === 'error' || level === 'fatal') process.stderr.write(encoded + '\n');
    else process.stdout.write(encoded + '\n');
  }
}
