import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppException } from './app.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

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
