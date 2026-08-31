import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, Logger, startTimer } from './logger';

/**
 * Typed via the helper's inferred return type rather than
 * `ReturnType<typeof vi.spyOn>`. The latter erases the generic parameters, so
 * the declared type is `MockInstance<unknown[], unknown>` while the assigned
 * value is `MockInstance<[message?: any, ...], void>`, and the two are not
 * assignable. Inferring from the call site keeps this correct across vitest
 * versions without naming any of its internal types.
 */
function spyOnConsoleLog() {
  return vi.spyOn(console, 'log').mockImplementation(() => {});
}

describe('Logger', () => {
  let consoleSpy: ReturnType<typeof spyOnConsoleLog>;

  beforeEach(() => {
    consoleSpy = spyOnConsoleLog();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('info() outputs valid JSON with timestamp, level, requestId, message', () => {
    const logger = createLogger({ requestId: 'req-123' });
    logger.info('test message');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);

    expect(output.timestamp).toBeDefined();
    expect(() => new Date(output.timestamp).toISOString()).not.toThrow();
    expect(output.level).toBe('INFO');
    expect(output.requestId).toBe('req-123');
    expect(output.message).toBe('test message');
  });

  it('info() includes userId and traceId when provided in context', () => {
    const logger = createLogger({
      requestId: 'req-456',
      userId: 'user-1',
      traceId: 'trace-abc',
    });
    logger.info('with context');

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.userId).toBe('user-1');
    expect(output.traceId).toBe('trace-abc');
  });

  it('error() serializes Error objects with message and stack', () => {
    const logger = createLogger({ requestId: 'req-789' });
    const testError = new Error('something went wrong');
    logger.error('an error occurred', testError);

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('ERROR');
    expect(output.error).toBeDefined();
    expect(output.error.message).toBe('something went wrong');
    expect(output.error.stack).toContain('something went wrong');
  });

  it('error() handles non-Error objects', () => {
    const logger = createLogger({ requestId: 'req-non-err' });
    logger.error('string error', 'just a string');

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.error.message).toBe('just a string');
  });

  it('PII fields are redacted', () => {
    const logger = createLogger({ requestId: 'req-pii' });
    logger.info('user data', {
      email: 'user@example.com',
      name: 'John Doe',
      address: '123 Main St',
      phone: '555-1234',
      password: 'secret',
      ssn: '123-45-6789',
      dateOfBirth: '1990-01-01',
      safeField: 'visible',
    });

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.email).toBe('[REDACTED]');
    expect(output.name).toBe('[REDACTED]');
    expect(output.address).toBe('[REDACTED]');
    expect(output.phone).toBe('[REDACTED]');
    expect(output.password).toBe('[REDACTED]');
    expect(output.ssn).toBe('[REDACTED]');
    expect(output.dateOfBirth).toBe('[REDACTED]');
    expect(output.safeField).toBe('visible');
  });

  it('PII fields are redacted in nested objects', () => {
    const logger = createLogger({ requestId: 'req-nested' });
    logger.info('nested data', {
      user: { email: 'hidden@test.com', role: 'admin' },
    });

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.user.email).toBe('[REDACTED]');
    expect(output.user.role).toBe('admin');
  });

  it('startTimer() returns elapsed duration', async () => {
    const elapsed = startTimer();

    // Wait a small amount of time
    await new Promise((resolve) => setTimeout(resolve, 50));

    const duration = elapsed();
    expect(duration).toBeGreaterThanOrEqual(40);
    expect(duration).toBeLessThan(200);
  });

  it('debug() outputs with DEBUG level', () => {
    const logger = createLogger({ requestId: 'req-debug' });
    logger.debug('debug message', { detail: 'some detail' });

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('DEBUG');
    expect(output.message).toBe('debug message');
    expect(output.detail).toBe('some detail');
  });

  it('warn() outputs with WARN level', () => {
    const logger = createLogger({ requestId: 'req-warn' });
    logger.warn('warning message');

    const output = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(output.level).toBe('WARN');
    expect(output.message).toBe('warning message');
  });
});
