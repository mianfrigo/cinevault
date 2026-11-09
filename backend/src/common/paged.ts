export interface Paged<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export function paged<T>(
  items: T[],
  page: number,
  totalPages: number,
  totalItems: number,
): Paged<T> {
  return { items, page, totalPages, totalItems };
}
