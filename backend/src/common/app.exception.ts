import { HttpException } from '@nestjs/common';

/** Error with a stable machine-readable `code`; rendered as {statusCode, code, message}. */
export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
  ) {
    super(message, status);
  }
}
