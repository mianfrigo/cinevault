import { Injectable } from '@nestjs/common';
import { AppException } from '../common/app.exception';
import { paged, type Paged } from '../common/paged';
import { CatalogService } from '../catalog/catalog.service';
import { MediaType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { MediaTypeParam, TitleSummary } from '../tmdb/tmdb.types';

export const PAGE_SIZE = 20;

/** The one place that maps the API's `movie|tv` to the DB enum and back. */
const toDb = (t: MediaTypeParam): MediaType =>
  t === 'movie' ? MediaType.MOVIE : MediaType.TV;
const toApi = (t: MediaType): MediaTypeParam =>
  t === MediaType.MOVIE ? 'movie' : 'tv';

export type FavoriteItem = TitleSummary & {
  addedAt: string;
  unavailable?: boolean;
};

/** The token outlives a deleted account: same answer as a bad token. */
const unauthorized = () =>
  new AppException(401, 'UNAUTHORIZED', 'Missing or malformed token');

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  private async requireUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw unauthorized();
  }

  /** Idempotent: an existing favorite is left untouched (its `createdAt` keeps the order). */
  async add(
    userId: string,
    type: MediaTypeParam,
    tmdbId: number,
  ): Promise<void> {
    try {
      await this.prisma.favorite.createMany({
        data: [{ userId, mediaType: toDb(type), tmdbId }],
        skipDuplicates: true,
      });
    } catch (e) {
      // Foreign key violation: the account was deleted while its token was still valid.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw unauthorized();
      }
      throw e;
    }
  }

  async remove(
    userId: string,
    type: MediaTypeParam,
    tmdbId: number,
  ): Promise<void> {
    await this.prisma.favorite.deleteMany({
      where: { userId, mediaType: toDb(type), tmdbId },
    });
  }

  async ids(
    userId: string,
  ): Promise<{ mediaType: MediaTypeParam; tmdbId: number }[]> {
    await this.requireUser(userId);
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      select: { mediaType: true, tmdbId: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((r) => ({
      mediaType: toApi(r.mediaType),
      tmdbId: r.tmdbId,
    }));
  }

  /** TMDB failures propagate (502); a title TMDB no longer has becomes `unavailable`. */
  async list(
    userId: string,
    type: MediaTypeParam | undefined,
    page: number,
  ): Promise<Paged<FavoriteItem>> {
    await this.requireUser(userId);
    const where = { userId, ...(type && { mediaType: toDb(type) }) };
    const [rows, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.favorite.count({ where }),
    ]);
    const refs = rows.map((r) => ({
      mediaType: toApi(r.mediaType),
      tmdbId: r.tmdbId,
    }));
    const summaries = await this.catalog.summaries(refs);
    const items = rows.map((r, i): FavoriteItem => {
      const addedAt = r.createdAt.toISOString();
      return summaries[i]
        ? { ...summaries[i], addedAt }
        : {
            ...refs[i],
            title: 'Unavailable title',
            year: null,
            rating: null,
            posterUrl: null,
            backdropUrl: null,
            overview: null,
            addedAt,
            unavailable: true,
          };
    });
    return paged(items, page, Math.ceil(total / PAGE_SIZE), total);
  }
}
