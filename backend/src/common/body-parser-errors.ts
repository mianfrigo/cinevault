import type { ErrorRequestHandler } from 'express';
import { AppException } from './app.exception';

const FIXED: Record<number, [code: string, message: string]> = {
  400: ['VALIDATION_ERROR', 'Malformed request body'],
  413: ['ERROR', 'Payload too large'],
  415: ['ERROR', 'Unsupported media type'],
};

/**
 * Error middleware registered right after the body parsers. Nest would wrap a
 * parse failure into a plain BadRequestException that echoes the parser text and
 * has lost its type, so it is converted here, where the original error is intact.
 * Only exposed 4xx http-errors carrying a parser `type` (entity.parse.failed,
 * entity.too.large, charset.unsupported...) are converted: parser
 * text and request content never reach the response. Everything else is passed on
 * untouched and ends up as a logged 500.
 */
export const parserErrorHandler: ErrorRequestHandler = (
  err,
  _req,
  _res,
  next,
) => {
  const { status, expose, type } = (err ?? {}) as Record<string, unknown>;
  if (
    typeof type !== 'string' ||
    expose !== true ||
    typeof status !== 'number' ||
    !Number.isInteger(status) ||
    status < 400 ||
    status > 499
  ) {
    return next(err);
  }
  const [code, message] = FIXED[status] ?? [
    'ERROR',
    'Request could not be processed',
  ];
  next(new AppException(status, code, message));
};
