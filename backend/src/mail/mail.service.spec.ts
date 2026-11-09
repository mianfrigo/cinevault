import type { SendMailOptions, Transporter } from 'nodemailer';
import type { Env } from '../config/env';
import { MailService } from './mail.service';

const env = {
  webOrigin: 'https://app.cinevault.test',
  mailFrom: 'Cinevault <no-reply@cinevault.test>',
} as Env;

function setup() {
  const sent: SendMailOptions[] = [];
  const transport = {
    sendMail: (m: SendMailOptions) => {
      sent.push(m);
      return Promise.resolve({});
    },
  } as unknown as Transporter;
  return { sent, mail: new MailService(transport, env) };
}

describe('MailService', () => {
  it('sendVerifyEmail sends to the address with the verify link containing the token', async () => {
    const { sent, mail } = setup();
    await mail.sendVerifyEmail('ana@example.com', 'Ana', 'tok_123-abc');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ana@example.com');
    expect(sent[0].from).toBe(env.mailFrom);
    const link = 'https://app.cinevault.test/verify-email?token=tok_123-abc';
    expect(sent[0].text).toContain(link);
    expect(sent[0].html).toContain(link);
    expect(sent[0].text).toContain('24 hours');
  });

  it('sendResetPassword link points to /reset-password', async () => {
    const { sent, mail } = setup();
    await mail.sendResetPassword('ana@example.com', 'Ana', 'tok_456');
    const link = 'https://app.cinevault.test/reset-password?token=tok_456';
    expect(sent[0].text).toContain(link);
    expect(sent[0].html).toContain(link);
    expect(sent[0].text).toContain('1 hour');
    expect(sent[0].text).not.toContain('/verify-email');
  });

  it('sendChangeEmail goes to the new address and uses the verify link', async () => {
    const { sent, mail } = setup();
    await mail.sendChangeEmail('new@example.com', 'Ana', 'tok_789');
    expect(sent[0].to).toBe('new@example.com');
    const link = 'https://app.cinevault.test/verify-email?token=tok_789';
    expect(sent[0].text).toContain(link);
    expect(sent[0].html).toContain(link);
    expect(sent[0].text).toContain('24 hours');
  });

  it('URL-encodes the token in the link', async () => {
    const { sent, mail } = setup();
    await mail.sendVerifyEmail('a@b.co', 'Ana', 'a b&c=d');
    expect(sent[0].text).toContain('?token=a%20b%26c%3Dd');
  });

  it('uses the expected subjects', async () => {
    const { sent, mail } = setup();
    await mail.sendVerifyEmail('a@b.co', 'Ana', 't');
    await mail.sendResetPassword('a@b.co', 'Ana', 't');
    await mail.sendChangeEmail('a@b.co', 'Ana', 't');
    await mail.sendAlreadyRegistered('a@b.co', 'Ana');
    expect(sent.map((m) => m.subject)).toEqual([
      'Verify your Cinevault email',
      'Reset your Cinevault password',
      'Confirm your new Cinevault email',
      'You already have a Cinevault account',
    ]);
  });

  it('emails never contain the word undefined', async () => {
    const { sent, mail } = setup();
    for (const name of ['Ana', '']) {
      await mail.sendVerifyEmail('a@b.co', name, 't');
      await mail.sendResetPassword('a@b.co', name, 't');
      await mail.sendChangeEmail('a@b.co', name, 't');
      await mail.sendAlreadyRegistered('a@b.co', name);
    }
    expect(sent).toHaveLength(8);
    for (const m of sent) {
      for (const part of [m.subject, m.text, m.html] as string[]) {
        expect(part).not.toContain('undefined');
      }
    }
  });

  it('sendAlreadyRegistered contains no token or link to verify', async () => {
    const { sent, mail } = setup();
    await mail.sendAlreadyRegistered('ana@example.com', 'Ana');
    expect(sent[0].to).toBe('ana@example.com');
    for (const body of [sent[0].text, sent[0].html] as string[]) {
      expect(body).not.toContain('token');
      expect(body).not.toContain('verify-email');
      expect(body).toContain('https://app.cinevault.test/login');
      expect(body).toContain('https://app.cinevault.test/forgot-password');
    }
  });

  it('escapes the user-supplied name in the HTML body', async () => {
    const { sent, mail } = setup();
    const evil = '<img src=x onerror=alert(1)>';
    await mail.sendVerifyEmail('a@b.co', evil, 't');
    await mail.sendResetPassword('a@b.co', evil, 't');
    await mail.sendChangeEmail('a@b.co', evil, 't');
    await mail.sendAlreadyRegistered('a@b.co', evil);
    for (const m of sent) {
      expect(m.html).not.toContain('<img');
      expect(m.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    }
  });

  it('propagates transport errors', async () => {
    const transport = {
      sendMail: () => Promise.reject(new Error('smtp down')),
    } as unknown as Transporter;
    const mail = new MailService(transport, env);
    await expect(mail.sendVerifyEmail('a@b.co', 'Ana', 't')).rejects.toThrow(
      'smtp down',
    );
  });
});
