import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppException } from './app.exception';

function clientErrorStatus(e: unknown): number | undefined {
  const { status, statusCode } = (e ?? {}) as Record<string, unknown>;
  const s = typeof status === 'number' ? status : statusCode;
  return typeof s === 'number' && Number.isInteger(s) && s >= 400 && s <= 499
    ? s
    : undefined;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    // Parser/Express errors: malformed JSON reaches us as a plain BadRequestException
    // (Nest maps SyntaxError and URIError), oversized bodies as a raw error with
    // status 413. Fixed messages only: parser messages echo request content. Our own
    // validation always throws AppException, so a plain 400 can only come from there.
    const status =
      exception instanceof HttpException
        ? !(exception instanceof AppException) && exception.getStatus() === 400
          ? 400
          : undefined
        : clientErrorStatus(exception);
    if (status) {
      res.status(status).json({
        statusCode: status,
        code: status === 400 ? 'VALIDATION_ERROR' : 'ERROR',
        message:
          status === 400
            ? 'Malformed request'
            : status === 413
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
    const code = exception instanceof AppException ? exception.code : 'ERROR';
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
