import type { Prisma } from '../generated/prisma/client';

/**
 * Locks every ACTIVE admin row (in id order, so two transactions cannot deadlock)
 * until commit and returns their ids. Every decision about "is this the last
 * admin" must count these locked rows, never a lock-free count: of two
 * concurrent demote/block/delete transactions the second waits here, then sees
 * the first one's result. Call it before touching any other row.
 */
export const lockActiveAdmins = (
  tx: Prisma.TransactionClient,
): Promise<{ id: string }[]> =>
  tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE' ORDER BY id FOR UPDATE`;
