import type { Logger } from '@nestjs/common';

/**
 * Runs `job` without awaiting it, so SMTP latency or failure cannot change the
 * response. Logs only the error class: never an address, token or link.
 */
export function runInBackground(
  logger: Logger,
  what: string,
  job: () => Promise<void>,
): void {
  void job().catch((e: unknown) =>
    logger.warn(
      `${what} failed: ${e instanceof Error ? e.name : 'Unknown error'}`,
    ),
  );
}
