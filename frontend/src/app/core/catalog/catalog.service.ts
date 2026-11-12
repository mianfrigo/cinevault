import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../api/api-client';
import {
  Genre,
  GenreCover,
  MediaTypeParam,
  Paged,
  SeasonDetail,
  TitleDetail,
  TitleSummary,
} from '../models';

export type ListKind = 'trending' | 'popular' | 'top-rated' | 'new';

/** Public catalog endpoints (TMDB data through the backend). */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly api = inject(ApiClient);

  list(kind: ListKind, type: MediaTypeParam, page = 1): Observable<Paged<TitleSummary>> {
    return this.api.get(`/catalog/${kind}`, { type, page });
  }

  genres(type: MediaTypeParam): Observable<Genre[]> {
    return this.api.get('/catalog/genres', { type });
  }

  genreCovers(type: MediaTypeParam): Observable<GenreCover[]> {
    return this.api.get('/catalog/genre-covers', { type });
  }

  discover(type: MediaTypeParam, genre: number, page = 1): Observable<Paged<TitleSummary>> {
    return this.api.get('/catalog/discover', { type, genre, page });
  }

  search(q: string, page = 1): Observable<Paged<TitleSummary>> {
    return this.api.get('/catalog/search', { q, page });
  }

  detail(type: MediaTypeParam, id: number): Observable<TitleDetail> {
    return this.api.get(`/catalog/${type}/${id}`);
  }

  season(tvId: number, n: number): Observable<SeasonDetail> {
    return this.api.get(`/catalog/tv/${tvId}/season/${n}`);
  }
}
