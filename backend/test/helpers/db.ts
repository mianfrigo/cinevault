import { PrismaService } from '../../src/prisma/prisma.service';

/** Empties every table between tests (CASCADE covers the foreign keys). */
export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE favorites, email_tokens, refresh_tokens, users RESTART IDENTITY CASCADE',
  );
}
