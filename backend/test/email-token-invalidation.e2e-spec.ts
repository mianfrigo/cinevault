import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { EmailTokensService } from '../src/auth/email-tokens.service';
import { PasswordService } from '../src/auth/password.service';
import type { Role, UserStatus } from '../src/generated/prisma/client';
import { MAIL_TRANSPORT } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDb } from './helpers/db';
import { flushTestRedis } from './helpers/redis';
import { waitForMail } from './helpers/wait';

interface Sent {
  to: string;
  subject: string;
  text: string;
}

class MailRecorder {
  sent: Sent[] = [];
  sendMail(m: Sent): Promise<void> {
    this.sent.push(m);
    return Promise.resolve();
  }
  reset() {
    this.sent = [];
  }
}

const tokenOf = (m: Sent) => /token=([\w-]+)/.exec(m.text)?.[1] as string;

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a brand new passphrase';
const ATTACKER = 'eve@example.com';

describe('Outstanding email tokens vs credential changes (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let mail: MailRecorder;
  let http: ReturnType<typeof request>;
  let passwordHash: string;

  beforeAll(async () => {
    mail = new MailRecorder();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(mail)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
    passwordHash = await app.get(PasswordService).hash(PASSWORD);
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await flushTestRedis();
    mail.reset();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  const makeUser = (
    email = 'ana@example.com',
    o: { role?: Role; status?: UserStatus } = {},
  ) =>
    prisma.user.create({
      data: {
        email,
        name: 'Ana',
        passwordHash,
        role: o.role ?? 'USER',
        status: o.status ?? 'ACTIVE',
        emailVerifiedAt: o.status === 'PENDING' ? null : new Date(),
      },
    });

  async function accessToken(email: string) {
    const res = await http
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return (res.body as { accessToken: string }).accessToken;
  }

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const verify = (token: string) =>
    http.post('/api/v1/auth/verify-email').send({ token });
  const forgot = (email: string) =>
    http.post('/api/v1/auth/forgot-password').send({ email });
  const emailOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id } })).email;
  const setStatus = (adminToken: string, id: string, status: string) =>
    http
      .patch(`/api/v1/admin/users/${id}`)
      .set(auth(adminToken))
      .send({ status })
      .expect(200);

  /** The attacker, knowing the password, asks for a change to their own address. */
  async function attackerChangeEmail() {
    const access = await accessToken('ana@example.com');
    await http
      .post('/api/v1/me/change-email')
      .set(auth(access))
      .send({ newEmail: ATTACKER, password: PASSWORD })
      .expect(202);
    await waitForMail(mail, 1);
    expect(mail.sent[0].to).toBe(ATTACKER);
    return { access, token: tokenOf(mail.sent[0]) };
  }

  async function expectTokenInvalid(token: string) {
    const res = await verify(token).expect(400);
    expect((res.body as { code: string }).code).toBe('TOKEN_INVALID');
  }

  it('a CHANGE_EMAIL token does not survive a password reset', async () => {
    const user = await makeUser();
    const { token } = await attackerChangeEmail();

    await forgot('ana@example.com').expect(202);
    await waitForMail(mail, 2);
    await http
      .post('/api/v1/auth/reset-password')
      .send({ token: tokenOf(mail.sent[1]), newPassword: NEW_PASSWORD })
      .expect(204);

    await expectTokenInvalid(token);
    expect(await emailOf(user.id)).toBe('ana@example.com');
  });

  it('a CHANGE_EMAIL token does not survive change-password', async () => {
    const user = await makeUser();
    const { access, token } = await attackerChangeEmail();

    await http
      .post('/api/v1/me/change-password')
      .set(auth(access))
      .send({ oldPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);

    await expectTokenInvalid(token);
    expect(await emailOf(user.id)).toBe('ana@example.com');
  });

  it('a CHANGE_EMAIL token does not survive an admin block then unblock', async () => {
    const user = await makeUser();
    await makeUser('admin@example.com', { role: 'ADMIN' });
    const adminToken = await accessToken('admin@example.com');
    const { token } = await attackerChangeEmail();

    await setStatus(adminToken, user.id, 'BLOCKED');
    await setStatus(adminToken, user.id, 'ACTIVE');

    await expectTokenInvalid(token);
    expect(await emailOf(user.id)).toBe('ana@example.com');
  });

  it('a pending RESET_PASSWORD token is void once a CHANGE_EMAIL token is consumed', async () => {
    const user = await makeUser();
    await forgot('ana@example.com').expect(202);
    await waitForMail(mail, 1);
    const resetToken = tokenOf(mail.sent[0]);

    const access = await accessToken('ana@example.com');
    await http
      .post('/api/v1/me/change-email')
      .set(auth(access))
      .send({ newEmail: 'new@example.com', password: PASSWORD })
      .expect(202);
    await waitForMail(mail, 2);
    await verify(tokenOf(mail.sent[1])).expect(204);
    expect(await emailOf(user.id)).toBe('new@example.com');

    const res = await http
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, newPassword: NEW_PASSWORD })
      .expect(400);
    expect((res.body as { code: string }).code).toBe('TOKEN_INVALID');
    await accessToken('new@example.com'); // the old password still works
  });

  it('a plain change-email then verify still works', async () => {
    const user = await makeUser();
    const { token } = await attackerChangeEmail();
    await verify(token).expect(204);
    expect(await emailOf(user.id)).toBe(ATTACKER);
  });

  it('a VERIFY_EMAIL token of a PENDING user is not voided by block then unblock', async () => {
    const pending = await makeUser('pending@example.com', {
      status: 'PENDING',
    });
    const verifyToken = await app
      .get(EmailTokensService)
      .issue(pending.id, 'VERIFY_EMAIL');
    await makeUser('admin@example.com', { role: 'ADMIN' });
    const adminToken = await accessToken('admin@example.com');

    await setStatus(adminToken, pending.id, 'BLOCKED');
    await setStatus(adminToken, pending.id, 'ACTIVE'); // back to PENDING: never verified

    await verify(verifyToken).expect(204);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: pending.id } }))
        .status,
    ).toBe('ACTIVE');
  });
});
