import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Length, Max, Min } from 'class-validator';
import { TMDB_MAX_PAGE } from '../tmdb/tmdb.constants';
import type { MediaTypeParam } from '../tmdb/tmdb.types';

const MEDIA_TYPES: MediaTypeParam[] = ['movie', 'tv'];
const MAX_ID = 2_147_483_647;

/** Query/path integers arrive as strings: convert, then require a whole number in range. */
const IntBetween = (min: number, max: number) =>
  applyDecorators(
    Type(() => Number),
    IsInt(),
    Min(min),
    Max(max),
  );

export class TypeQuery {
  @IsIn(MEDIA_TYPES)
  type: MediaTypeParam = 'movie';
}

export class ListQuery extends TypeQuery {
  @IntBetween(1, TMDB_MAX_PAGE)
  page = 1;
}

export class DiscoverQuery extends ListQuery {
  @IntBetween(1, MAX_ID)
  genre!: number;
}

export class SearchQuery {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  q!: string;

  @IntBetween(1, TMDB_MAX_PAGE)
  page = 1;
}

export class TitleParams {
  @IsIn(MEDIA_TYPES)
  type!: MediaTypeParam;

  @IntBetween(1, MAX_ID)
  id!: number;
}

export class SeasonParams {
  @IntBetween(1, MAX_ID)
  id!: number;

  @IntBetween(1, 1000)
  n!: number;
}
