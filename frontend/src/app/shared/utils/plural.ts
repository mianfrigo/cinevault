/** "title" or "titles" for a count: `${n} ${plural(n, 'title')}`. Pass `many` for an irregular plural. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}
