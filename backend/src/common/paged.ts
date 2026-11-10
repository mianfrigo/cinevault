export interface Paged<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
}
