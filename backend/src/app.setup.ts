import {
  INestApplication,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppException } from './common/app.exception';
import { ENV, Env } from './config/env';

function validationMessage(errors: ValidationError[]): string {
  const walk = (e: ValidationError): string[] => [
    ...Object.values(e.constraints ?? {}),
    ...(e.children ?? []).flatMap(walk),
  ];
  return errors.flatMap(walk).join('; ');
}

/** Shared by main.ts and every e2e test so tests run the real pipeline. */
export function configureApp(app: INestApplication): void {
  const env = app.get<Env>(ENV);

  if (env.trustProxy) {
    (app as NestExpressApplication).set('trust proxy', true);
  }
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.webOrigin, credentials: true });
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
