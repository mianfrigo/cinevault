import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppException } from './app.exception';

/**
 * Errors body-parser throws itself (http-errors: `expose` true, 4xx status), e.g. 413
 * entity.too.large. Anything else with a status field is NOT trusted: it may come
 * from an HTTP client, Redis, a mailer...
 */
function exposedClientStatus(e: unknown): number | undefined {
  const { status, expose } = (e ?? {}) as Record<string, unknown>;
  return expose === true &&
    typeof status === 'number' &&
    status >= 400 &&
    status <= 499
    ? status
    : undefined;
}

/**
 * Nest wraps body-parser's SyntaxError into a plain BadRequestException that echoes
 * the parser message and drops the error type. The wrapped case is recognisable by
 * the request: JSON content with a body, yet no parsed `req.body`.
 */
function isJsonParseFailure(req: Request | undefined): boolean {
  const h = req?.headers ?? {};
  const hasBody =
    h['transfer-encoding'] !== undefined || Number(h['content-length']) > 0;
  return hasBody && req?.body === undefined && !!req?.is?.('json');
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    const parserStatus =
      exception instanceof HttpException
        ? !(exception instanceof AppException) &&
          exception.getStatus() === 400 &&
          isJsonParseFailure(host.switchToHttp().getRequest<Request>())
          ? 400
          : undefined
        : exposedClientStatus(exception);
    if (parserStatus) {
      // Fixed messages only: parser messages echo request content.
      res.status(parserStatus).json({
        statusCode: parserStatus,
        code: parserStatus === 400 ? 'VALIDATION_ERROR' : 'ERROR',
        message:
          parserStatus === 400
            ? 'Malformed request body'
            : parserStatus === 413
              ? 'Payload too large'
              : 'Request could not be processed',
      });
      return;
    }

    if (!(exception instanceof HttpException)) {
      // Log the error type only: messages and stacks could carry tokens or user data.
      this.logger.error(
        exception instanceof Error ? exception.name : 'Unknown error',
      );
      res.status(500).json({
        statusCode: 500,
        code: 'ERROR',
        message: 'Internal server error',
      });
      return;
    }

    const statusCode = exception.getStatus();
    const code =
      exception instanceof AppException
        ? exception.code
        : statusCode === 400
          ? 'VALIDATION_ERROR'
          : 'ERROR';
    const body = exception.getResponse();
    const raw =
      typeof body === 'string' ? body : (body as { message?: unknown }).message;
    const message = Array.isArray(raw)
      ? raw.join('; ')
      : typeof raw === 'string'
        ? raw
        : '';
    res.status(statusCode).json({ statusCode, code, message });
  }
}
