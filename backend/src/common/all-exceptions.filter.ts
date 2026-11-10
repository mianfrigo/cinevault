import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { AppException } from './app.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      // Anything unknown is a 500, whatever status field it carries (it may come from
      // an HTTP client, Redis, a mailer...). Body-parser errors are converted to
      // AppException earlier, see body-parser-errors.ts.
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

    if (exception instanceof ThrottlerException) {
      // The guard already set Retry-After on the response; keep it.
      res.status(429).json({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Too many requests, try again later.',
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
