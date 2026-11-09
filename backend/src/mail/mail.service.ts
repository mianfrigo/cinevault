import { Inject, Injectable } from '@nestjs/common';
import type { Transporter } from 'nodemailer';
import { ENV, type Env } from '../config/env';
import * as t from './templates';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** Transport errors propagate: callers decide whether a failed send matters. */
@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: Transporter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async send(to: string, mail: t.Mail): Promise<void> {
    await this.transport.sendMail({ from: this.env.mailFrom, to, ...mail });
  }

  sendVerifyEmail(to: string, name: string, token: string) {
    return this.send(to, t.verifyEmail(this.env.webOrigin, name, token));
  }

  sendResetPassword(to: string, name: string, token: string) {
    return this.send(to, t.resetPassword(this.env.webOrigin, name, token));
  }

  sendChangeEmail(to: string, name: string, token: string) {
    return this.send(to, t.changeEmail(this.env.webOrigin, name, token));
  }

  sendAlreadyRegistered(to: string, name: string) {
    return this.send(to, t.alreadyRegistered(this.env.webOrigin, name));
  }
}
