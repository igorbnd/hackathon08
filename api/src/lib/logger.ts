export interface LoggerContext {
  requestId: string;
  userId?: string;
  traceId?: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  requestId: string;
  userId?: string;
  traceId?: string;
  message: string;
  action?: string;
  duration?: number;
  error?: { message: string; stack?: string };
  [key: string]: unknown;
}

const PII_FIELDS = new Set([
  'email',
  'name',
  'address',
  'phone',
  'password',
  'ssn',
  'dateOfBirth',
]);

function redactPII(data: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (PII_FIELDS.has(key)) {
      redacted[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      redacted[key] = redactPII(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function serializeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

export class Logger {
  private context: LoggerContext;

  constructor(context: LoggerContext) {
    this.context = context;
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('WARN', message, data);
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      requestId: this.context.requestId,
      message,
    };

    if (this.context.userId) {
      entry.userId = this.context.userId;
    }
    if (this.context.traceId) {
      entry.traceId = this.context.traceId;
    }
    if (error) {
      entry.error = serializeError(error);
    }
    if (data) {
      const redacted = redactPII(data);
      Object.assign(entry, redacted);
    }

    console.log(JSON.stringify(entry));
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('DEBUG', message, data);
  }

  private log(
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      requestId: this.context.requestId,
      message,
    };

    if (this.context.userId) {
      entry.userId = this.context.userId;
    }
    if (this.context.traceId) {
      entry.traceId = this.context.traceId;
    }
    if (data) {
      const redacted = redactPII(data);
      Object.assign(entry, redacted);
    }

    console.log(JSON.stringify(entry));
  }
}

export function createLogger(context: LoggerContext): Logger {
  return new Logger(context);
}
