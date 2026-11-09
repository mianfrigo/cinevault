import { ValidationError, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppException } from './common/app.exception';
import { parserErrorHandler } from './common/body-parser-errors';
import { ENV, Env } from './config/env';

function validationMessage(errors: ValidationError[]): string {
  const walk = (e: ValidationError): string[] => [
    ...Object.values(e.constraints ?? {}),
    ...(e.children ?? []).flatMap(walk),
  ];
  return errors.flatMap(walk).join('; ');
}

/** Shared by main.ts and every e2e test so tests run the real pipeline. */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);

  if (env.trustProxy) {
    app.set('trust proxy', true);
  }
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  // CORS before the body parsers: their error responses (400/413/415) must carry
  // the CORS headers, or a browser shows an opaque network error instead.
  app.enableCors({ origin: env.webOrigin, credentials: true });
  app.use(cookieParser());
  // Registered here (not left to Nest's defaults) so parser errors can be
  // converted right after them. Nest skips its own parsers once these exist.
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
  app.use(parserErrorHandler);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new AppException(400, 'VALIDATION_ERROR', validationMessage(errors)),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
