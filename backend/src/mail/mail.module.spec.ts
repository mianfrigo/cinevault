import type { Env } from '../config/env';
import {
  CONNECTION_TIMEOUT_MS,
  createMailTransport,
  GREETING_TIMEOUT_MS,
  SOCKET_TIMEOUT_MS,
} from './mail.module';

describe('createMailTransport', () => {
  it('keeps the SMTP URL from env and sets explicit timeouts', () => {
    const transport = createMailTransport({
      smtpUrl: 'smtp://mail.example.test:2525',
    } as Env);
    const options = (
      transport as unknown as {
        transporter: { options: Record<string, unknown> };
      }
    ).transporter.options;
    expect(options).toMatchObject({
      host: 'mail.example.test',
      port: 2525,
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
    expect(CONNECTION_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    expect(GREETING_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
    expect(SOCKET_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});
