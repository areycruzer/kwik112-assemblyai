/**
 * @module Logger
 * @description Cross-environment logging utility that prefers Winston on the server
 *              while gracefully falling back to console logging in the browser.
 */

type LogPayload = Record<string, unknown> | undefined;

interface LoggerFacade {
  /** @description Informational messages describing standard workflow transitions. */
  info: (message: string, meta?: LogPayload) => void;
  /** @description Warnings indicating recoverable issues or unexpected states. */
  warn: (message: string, meta?: LogPayload) => void;
  /** @description Errors signalling failed operations or thrown exceptions. */
  error: (message: string, meta?: LogPayload) => void;
  /** @description Verbose diagnostic output for development debugging. */
  debug: (message: string, meta?: LogPayload) => void;
  /** @description Detailed operational tracing for complex workflows. */
  verbose: (message: string, meta?: LogPayload) => void;
}

let cachedServerLogger: LoggerFacade | null = null;

/**
 * @description Ensures Winston is only required on the server to avoid bundling issues on the client.
 *              Falls back to a console logger when the dependency is unavailable (e.g. minimal serverless runtime).
 */
function createServerLogger(): LoggerFacade {
  if (cachedServerLogger) {
    return cachedServerLogger;
  }

  try {
    const { createLogger, format, transports } = (eval('require') as NodeRequire)(
      'winston'
    ) as typeof import('winston');

    const baseLogger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.errors({ stack: true }),
        format.splat(),
        format.timestamp(),
        format.json()
      ),
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.timestamp(),
            format.printf(({ timestamp, level, message, ...rest }) => {
              const context = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
              return `${timestamp} [${level}] ${message}${context}`;
            })
          )
        })
      ]
    });

    cachedServerLogger = {
      info: (message, meta) => baseLogger.info(message, meta),
      warn: (message, meta) => baseLogger.warn(message, meta),
      error: (message, meta) => baseLogger.error(message, meta),
      debug: (message, meta) => baseLogger.debug(message, meta),
      verbose: (message, meta) =>
        typeof baseLogger.verbose === 'function'
          ? baseLogger.verbose(message, meta)
          : baseLogger.info(message, meta)
    };
  } catch (error) {
    const fallback = createClientLogger();
    if (typeof console !== 'undefined') {
      console.warn('[logger] Winston unavailable, using console fallback', error);
    }
    cachedServerLogger = fallback;
  }

  return cachedServerLogger;
}

/**
 * @description Provides a console-backed logger when running in the browser.
 */
function createClientLogger(): LoggerFacade {
  return {
    info: (message, meta) => console.info(`[info] ${message}`, meta ?? ''),
    warn: (message, meta) => console.warn(`[warn] ${message}`, meta ?? ''),
    error: (message, meta) => console.error(`[error] ${message}`, meta ?? ''),
    debug: (message, meta) => console.debug(`[debug] ${message}`, meta ?? ''),
    verbose: (message, meta) => console.log(`[verbose] ${message}`, meta ?? '')
  };
}

/**
 * @description Exposes the appropriate logger for the current runtime.
 */
export const logger: LoggerFacade =
  typeof window === 'undefined' ? createServerLogger() : createClientLogger();


