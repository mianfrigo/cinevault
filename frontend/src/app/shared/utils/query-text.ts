/** A query param as text: a repeated param (`?a=1&a=2`) arrives as an array and counts as absent. */
export const queryText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
