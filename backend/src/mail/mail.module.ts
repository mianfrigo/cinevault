import { Module } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { ENV, type Env } from '../config/env';
import { MAIL_TRANSPORT, MailService } from './mail.service';

export { MAIL_TRANSPORT };

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORT,
      useFactory: (env: Env) => createTransport(env.smtpUrl),
      inject: [ENV],
    },
    MailService,
  ],
  exports: [MailService, MAIL_TRANSPORT],
})
export class MailModule {}
