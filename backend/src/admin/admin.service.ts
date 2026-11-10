import { Injectable } from '@nestjs/common';
import { BlockListService } from '../auth/blocklist.service';
import { SessionsService } from '../auth/sessions.service';
import { AppException } from '../common/app.exception';
import { paged, type Paged } from '../common/paged';
import type { Prisma, Role, User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lockActiveAdmins } from '../users/admin-lock';
import { toUserDto, type UserDto } from '../users/user.dto';

export const ADMIN_PAGE_SIZE = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const NEWEST_FIRST = [{ createdAt: 'desc' }, { id: 'desc' }] as const;

const invalid = (message: string) =>
  new AppException(400, 'VALIDATION_ERROR', message);
const notFound = () => new AppException(404, 'NOT_FOUND', 'User not found');
const selfAction = () =>
  new AppException(409, 'SELF_ACTION', 'Admins cannot do this to themselves');

/** Prisma passes `contains` to LIKE/ILIKE unescaped, so % _ and \ are escaped here. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly blocklist: BlockListService,
  ) {}

  async listUsers(
    q: string | undefined,
    page: number,
  ): Promise<Paged<UserDto>> {
    const term = q ? escapeLike(q) : undefined;
    const where: Prisma.UserWhereInput = term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {};
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [...NEWEST_FIRST],
        skip: (page - 1) * ADMIN_PAGE_SIZE,
        take: ADMIN_PAGE_SIZE,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paged(
      users.map(toUserDto),
      page,
      Math.ceil(total / ADMIN_PAGE_SIZE),
      total,
    );
  }

  /**
   * First step of every mutation, inside the caller's transaction: locks the
   * active admins, then loads the target. `destructive(target)` says whether the
   * change takes an admin's powers away. Order of the refusals matters: an
   * attempt on the only active admin is LAST_ADMIN even from a stale actor;
   * then the actor must still be an ACTIVE admin in the DB (the JWT role is
   * trusted for up to 10 minutes after a demotion or block): 403; then 404.
   */
  private async lockAndLoad(
    tx: Prisma.TransactionClient,
    actorId: string,
    id: string,
    destructive: (target: User) => boolean,
  ): Promise<User> {
    const admins = await lockActiveAdmins(tx);
    const target = await tx.user.findUnique({ where: { id } });
    if (
      target?.role === 'ADMIN' &&
      target.status === 'ACTIVE' &&
      admins.length === 1 &&
      destructive(target)
    ) {
      throw new AppException(
        409,
        'LAST_ADMIN',
        'The last active admin cannot be demoted, blocked or deleted',
      );
    }
    if (!admins.some((a) => a.id === actorId)) {
      throw new AppException(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    if (!target) throw notFound();
    return target;
  }

  async updateUser(
    actorId: string,
    id: string,
    patch: { role?: Role; status?: 'ACTIVE' | 'BLOCKED' },
  ): Promise<UserDto> {
    if (actorId === id) throw selfAction();
    const { role, status } = patch;
    if (role === undefined && status === undefined) {
      throw invalid('Provide role and/or status');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const target = await this.lockAndLoad(
        tx,
        actorId,
        id,
        () => role === 'USER' || status === 'BLOCKED',
      );
      if (role !== undefined && role === target.role) {
        throw invalid(`The user already has the role ${role}`);
      }
      if (status === 'BLOCKED' && target.status === 'BLOCKED') {
        throw invalid('The user is already blocked');
      }
      // Known edge: a user blocked before ever verifying their email goes back
      // to ACTIVE here (per spec); only a PENDING user is refused.
      if (status === 'ACTIVE' && target.status !== 'BLOCKED') {
        throw invalid('Only a blocked user can be set to ACTIVE');
      }
      // The user row is updated before its tokens, the same lock order as
      // reset-password and a refresh rotation.
      const { count } = await tx.user.updateMany({
        where: { id },
        data: { role, status },
      });
      if (count !== 1) throw notFound(); // self-deleted meanwhile
      if (status === 'BLOCKED') await this.sessions.revokeAll(id, tx);
      return tx.user.findUniqueOrThrow({ where: { id } });
    });

    // After commit, so the block list never gets ahead of the DB. A failed write
    // is swallowed and logged by BlockListService (accepted degradation).
    if (status === 'BLOCKED') await this.blocklist.block(id);
    if (status === 'ACTIVE') await this.blocklist.unblock(id);
    return toUserDto(user);
  }

  async deleteUser(actorId: string, id: string): Promise<void> {
    if (actorId === id) throw selfAction();
    await this.prisma.$transaction(async (tx) => {
      await this.lockAndLoad(tx, actorId, id, () => true);
      // Favorites and tokens go with the user (ON DELETE CASCADE).
      await tx.user.deleteMany({ where: { id } });
    });
  }

  async overview(): Promise<{
    totalUsers: number;
    newThisWeek: number;
    recentSignups: UserDto[];
  }> {
    const [totalUsers, newThisWeek, recent] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { createdAt: { gte: new Date(Date.now() - WEEK_MS) } },
      }),
      this.prisma.user.findMany({ orderBy: [...NEWEST_FIRST], take: 5 }),
    ]);
    return { totalUsers, newThisWeek, recentSignups: recent.map(toUserDto) };
  }
}
