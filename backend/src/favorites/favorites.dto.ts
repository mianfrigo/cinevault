import { IsIn, IsOptional } from 'class-validator';
import { IntBetween, MAX_ID, MEDIA_TYPES } from '../catalog/catalog.dto';
import { TMDB_MAX_PAGE } from '../tmdb/tmdb.constants';
import type { MediaTypeParam } from '../tmdb/tmdb.types';

export class FavoritesQuery {
  @IsOptional()
  @IsIn(MEDIA_TYPES)
  type?: MediaTypeParam;

  @IntBetween(1, TMDB_MAX_PAGE)
  page = 1;
}

export class FavoriteParams {
  @IsIn(MEDIA_TYPES)
  type!: MediaTypeParam;

  @IntBetween(1, MAX_ID)
  tmdbId!: number;
}
