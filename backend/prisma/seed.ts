import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { normalizeEmail } from '../src/auth/email';
import { PasswordService } from '../src/auth/password.service';
import { PrismaClient, Role, UserStatus } from '../src/generated/prisma/client';

type Raw = Record<string, string | undefined>;

/** Safe to print: its message names a variable, never a value. */
class SeedInputError extends Error {}

/**
 * Creates the admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD, or promotes the existing
 * user with that email. A verified user keeps its password hash, name and verification
 * date: re-running the seed must never reset a live admin's password. An unverified one
 * (pre-registered by someone else) gets the seed password and loses its tokens.
 * Errors name the variable only, never a value.
 */
export async function runSeed(raw: Raw, prisma: PrismaClient): Promise<void> {
  const rawEmail = raw.SEED_ADMIN_EMAIL?.trim();
  const password = raw.SEED_ADMIN_PASSWORD;
  if (!rawEmail) throw new SeedInputError('SEED_ADMIN_EMAIL is required');
  if (!password) throw new SeedInputError('SEED_ADMIN_PASSWORD is required');
  // Same limits as registration (RegisterDto).
  if (password.length < 10 || password.length > 128) {
    throw new SeedInputError(
      'SEED_ADMIN_PASSWORD must be 10 to 128 characters',
    );
  }
  const email = normalizeEmail(rawEmail);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new SeedInputError('SEED_ADMIN_EMAIL must be a valid email address');
  }

  const now = new Date();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.emailVerifiedAt) {
    // A verified account is live: keep its password, name and verification date.
    await prisma.user.update({
      where: { email },
      data: { role: Role.ADMIN, status: UserStatus.ACTIVE },
    });
    return;
  }
  const passwordHash = await new PasswordService().hash(password);
  if (existing) {
    // Never verified: whoever registered this address before the seed ran does not own it.
    // Replace their password and drop everything issued to them (name is kept).
    await prisma.$transaction([
      prisma.user.update({
        where: { email },
        data: {
          passwordHash,
          role: Role.ADMIN,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: now,
        },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: existing.id } }),
      prisma.emailToken.deleteMany({
        where: { userId: existing.id, usedAt: null },
      }),
    ]);
    return;
  }
  await prisma.user.create({
    data: {
      email,
      name: 'Admin',
      passwordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: now,
    },
  });
}

async function main(): Promise<void> {
  // Like main.ts: backend/.env if present; variables already set in the shell win.
  const envFile = join(__dirname, '..', '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.DATABASE_URL;
  if (!url) throw new SeedInputError('DATABASE_URL is required');

  // Same adapter setup as PrismaService.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  try {
    await runSeed(process.env, prisma);
    console.log('Admin seeded.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e: unknown) => {
    // Anything but our own input errors (driver errors) is reduced to its type name.
    console.error(
      `Seed failed: ${e instanceof SeedInputError ? e.message : e instanceof Error ? e.name : 'unknown error'}`,
    );
    process.exit(1);
  });
}
