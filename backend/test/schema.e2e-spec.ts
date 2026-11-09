import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetDb } from './helpers/db';

describe('database schema', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
  });

  const newUser = (email = 'a@example.com') =>
    prisma.user.create({ data: { email, name: 'A', passwordHash: 'x' } });

  it('inserting the same (userId, mediaType, tmdbId) favorite twice throws a unique violation', async () => {
    const user = await newUser();
    const data = { userId: user.id, mediaType: 'MOVIE' as const, tmdbId: 603 };
    await prisma.favorite.create({ data });
    await expect(prisma.favorite.create({ data })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('deleting a user cascades to favorites, refresh_tokens and email_tokens', async () => {
    const user = await newUser();
    const expiresAt = new Date(Date.now() + 60_000);
    await prisma.favorite.create({
      data: { userId: user.id, mediaType: 'TV', tmdbId: 1399 },
    });
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: 'r', expiresAt },
    });
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        type: 'VERIFY_EMAIL',
        tokenHash: 'e',
        expiresAt,
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.favorite.count()).toBe(0);
    expect(await prisma.refreshToken.count()).toBe(0);
    expect(await prisma.emailToken.count()).toBe(0);
  });

  it('users.email is unique', async () => {
    await newUser('dup@example.com');
    await expect(newUser('dup@example.com')).rejects.toMatchObject({
      code: 'P2002',
    });
  });
});
