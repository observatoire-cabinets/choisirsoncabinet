/**
 * No-op local, logger interne du cœur autonome.
 * Même surface d'appel que le logger applicatif (pino) : logger.info/warn(obj, msg).
 */
export const logger = {
  info: (..._args: unknown[]): void => {},
  warn: (..._args: unknown[]): void => {},
};
