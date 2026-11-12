import { Controller, Get, Query, Param } from '@nestjs/common';
import {
  DiscoverQuery,
  ListQuery,
  SearchQuery,
  SeasonParams,
  TitleParams,
  TypeQuery,
} from './catalog.dto';
import { CatalogService } from './catalog.service';

// Fixed paths are declared before the `:type/:id` pattern.
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('trending')
  trending(@Query() q: ListQuery) {
    return this.catalog.list('trending', q.type, q.page);
  }

  @Get('popular')
  popular(@Query() q: ListQuery) {
    return this.catalog.list('popular', q.type, q.page);
  }

  @Get('top-rated')
  topRated(@Query() q: ListQuery) {
    return this.catalog.list('top-rated', q.type, q.page);
  }

  @Get('new')
  newest(@Query() q: ListQuery) {
    return this.catalog.list('new', q.type, q.page);
  }

  @Get('genres')
  genres(@Query() q: TypeQuery) {
    return this.catalog.genres(q.type);
  }

  @Get('genre-covers')
  genreCovers(@Query() q: TypeQuery) {
    return this.catalog.genreCovers(q.type);
  }

  @Get('discover')
  discover(@Query() q: DiscoverQuery) {
    return this.catalog.discover(q.type, q.genre, q.page);
  }

  @Get('search')
  search(@Query() q: SearchQuery) {
    return this.catalog.search(q.q, q.page);
  }

  @Get('tv/:id/season/:n')
  season(@Param() p: SeasonParams) {
    return this.catalog.season(p.id, p.n);
  }

  @Get(':type/:id')
  detail(@Param() p: TitleParams) {
    return this.catalog.detail(p.type, p.id);
  }
}
