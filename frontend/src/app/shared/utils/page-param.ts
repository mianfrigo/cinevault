import { inject } from '@angular/core';
import { Router } from '@angular/router';

/** The catalog API (TMDB) answers 400 above page 500. */
export const MAX_PAGE = 500;

/** The `?page=` value as a page number for the API: 1..500, anything else (missing, text, decimals, negatives) is 1 or the cap. */
export function normalisePage(raw: unknown): number {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return 1;
  return Math.min(Math.max(Number(raw), 1), MAX_PAGE);
}

/**
 * Returns a function that puts a page into the `?page=` query param (page 1 leaves it out so the
 * first page keeps its clean URL) and keeps the other query params. The router scrolls to the top.
 * Must be called in an injection context.
 */
export function injectPageNavigator(): (page: number) => void {
  const router = inject(Router);
  return (page) => {
    void router.navigate([], {
      queryParams: { page: page > 1 ? page : null },
      queryParamsHandling: 'merge',
    });
  };
}
