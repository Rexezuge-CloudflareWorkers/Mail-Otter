import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger, NullLogger } from '@mail-otter/shared/utils';

const spies = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe('ConsoleLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'debug').mockImplementation((...args: unknown[]) => spies.debug(...args));
    vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => spies.info(...args));
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => spies.warn(...args));
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => spies.error(...args));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards each level to the matching console method', () => {
    const logger = new ConsoleLogger();

    logger.debug('debug-msg');
    logger.info('info-msg', { key: 'value' });
    logger.warn('warn-msg');
    logger.error('error-msg', new Error('boom'));

    expect(spies.debug).toHaveBeenCalledWith('debug-msg');
    expect(spies.info).toHaveBeenCalledWith('info-msg', { key: 'value' });
    expect(spies.warn).toHaveBeenCalledWith('warn-msg');
    expect(spies.error).toHaveBeenCalledWith('error-msg', expect.any(Error));
  });

  it('prepends the prefix when one is configured', () => {
    const logger = new ConsoleLogger('[MailOtter]');

    logger.info('hello');
    logger.error('oops');

    expect(spies.info).toHaveBeenCalledWith('[MailOtter]', 'hello');
    expect(spies.error).toHaveBeenCalledWith('[MailOtter]', 'oops');
  });

  it('omits the prefix when none is configured', () => {
    const logger = new ConsoleLogger('');

    logger.warn('plain');

    expect(spies.warn).toHaveBeenCalledWith('plain');
  });
});

describe('NullLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('discards output at every level', () => {
    const logger = new NullLogger();

    logger.debug('d');
    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(console.debug).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
