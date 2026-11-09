import { Module } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { ENV, type Env } from '../config/env';
import { MAIL_TRANSPORT, MailService } from './mail.service';

export { MAIL_TRANSPORT };

// nodemailer defaults are 2 min (connect) and 10 min (socket): an unreachable SMTP
// host would hold an awaiting HTTP request for minutes.
export const CONNECTION_TIMEOUT_MS = 10_000;
export const GREETING_TIMEOUT_MS = 10_000;
export const SOCKET_TIMEOUT_MS = 10_000;

export const createMailTransport = (env: Env) =>
  createTransport({
    url: env.smtpUrl,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });

@Module({
  providers: [
    { provide: MAIL_TRANSPORT, useFactory: createMailTransport, inject: [ENV] },
    MailService,
  ],
  exports: [MailService, MAIL_TRANSPORT],
})
export class MailModule {}
