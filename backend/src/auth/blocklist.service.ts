import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Whether a user is blocked, read from the user row on every guarded request, so a block takes
 * effect on the next request and does not depend on the cache (which can evict a marker, or be down).
 * A database error propagates: a request that cannot be checked is refused, not let through.
 * ponytail: one primary-key read per request; a cache in front is the upgrade if it ever shows up in
 * a profile, but then the cache must be a store that cannot evict.
 */
@Injectable()
export class BlockListService {
  constructor(private readonly prisma: PrismaService) {}

  async isBlocked(userId: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    return row?.status === 'BLOCKED';
  }
}
