import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../common/app.exception';

/**
 * Cookie-setting and cookie-reading auth routes take only `Content-Type: application/json`. A
 * cross-site form or a text/plain POST cannot send that without a CORS preflight, so a hostile page
 * cannot submit them from a visitor's browser (login CSRF would plant the attacker's session
 * cookie; refresh is the other cookie-authenticated mutation). A guard, so it answers 415 before
 * the validation pipe sees the body. `req.is` is falsy for a request without a body, so clients
 * send a JSON body (`{}` is enough).
 */
@Injectable()
export class JsonOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.is('application/json')) {
      throw new AppException(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json',
      );
    }
    return true;
  }
}
