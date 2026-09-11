interface ILogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class ConsoleLogger implements ILogger {
  private readonly prefix: string;

  constructor(prefix = '') {
    this.prefix = prefix;
  }

  public debug(...args: unknown[]): void {
    this.write('debug', args);
  }

  public info(...args: unknown[]): void {
    this.write('info', args);
  }

  public warn(...args: unknown[]): void {
    this.write('warn', args);
  }

  public error(...args: unknown[]): void {
    this.write('error', args);
  }

  private write(level: LogLevel, args: unknown[]): void {
    if (this.prefix) {
      console[level](this.prefix, ...args);
    } else {
      console[level](...args);
    }
  }
}

class NullLogger implements ILogger {
  public debug(..._args: unknown[]): void {
    // Intentionally empty - discards log output in tests and quiet code paths.
  }

  public info(..._args: unknown[]): void {
    // Intentionally empty - discards log output in tests and quiet code paths.
  }

  public warn(..._args: unknown[]): void {
    // Intentionally empty - discards log output in tests and quiet code paths.
  }

  public error(..._args: unknown[]): void {
    // Intentionally empty - discards log output in tests and quiet code paths.
  }
}

export { ConsoleLogger, NullLogger };
export type { ILogger, LogLevel };
