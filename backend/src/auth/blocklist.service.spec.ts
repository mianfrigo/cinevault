import type { PrismaService } from '../prisma/prisma.service';
import { BlockListService } from './blocklist.service';

const withStatus = (row: { status: string } | null) => {
  const findUnique = jest.fn(() => Promise.resolve(row));
  return {
    findUnique,
    svc: new BlockListService({
      user: { findUnique },
    } as unknown as PrismaService),
  };
};

describe('BlockListService', () => {
  it('reads the status of the user row: only BLOCKED is blocked', async () => {
    expect(await withStatus({ status: 'BLOCKED' }).svc.isBlocked('u1')).toBe(
      true,
    );
    expect(await withStatus({ status: 'ACTIVE' }).svc.isBlocked('u1')).toBe(
      false,
    );
    expect(await withStatus({ status: 'PENDING' }).svc.isBlocked('u1')).toBe(
      false,
    );
  });

  it('a user who no longer exists is not blocked (the route answers its own 401)', async () => {
    expect(await withStatus(null).svc.isBlocked('gone')).toBe(false);
  });

  it('asks for the status column of that id only', async () => {
    const { findUnique, svc } = withStatus({ status: 'ACTIVE' });
    await svc.isBlocked('u1');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { status: true },
    });
  });

  it('lets a database error through: a request that cannot be checked is refused, not allowed', async () => {
    const svc = new BlockListService({
      user: { findUnique: () => Promise.reject(new Error('db down')) },
    } as unknown as PrismaService);
    await expect(svc.isBlocked('u1')).rejects.toThrow('db down');
  });
});
