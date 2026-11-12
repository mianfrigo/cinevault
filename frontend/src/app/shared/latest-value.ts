import { computed, linkedSignal, Resource, Signal } from '@angular/core';

/**
 * The resource's value, kept while the next request is loading so the previous page stays on
 * screen (and keyboard focus stays on the paginator button that was used). It is kept only while
 * `key` is unchanged (paging keeps it, switching genre or query does not) and dropped on error or
 * when idle. Reads `value()` only behind `hasValue()`: it throws while the resource is in error.
 */
export function latestValue<T>(
  res: Resource<T | undefined>,
  key: () => unknown,
): Signal<T | undefined> {
  const kept = linkedSignal<
    { key: unknown; value: T | undefined; loading: boolean },
    { key: unknown; value: T | undefined }
  >({
    source: () => ({
      key: key(),
      value: res.hasValue() ? res.value() : undefined,
      loading: res.isLoading(),
    }),
    computation: (src, previous) => ({
      key: src.key,
      value:
        src.value ??
        (src.loading && previous?.value.key === src.key ? previous?.value.value : undefined),
    }),
  });
  return computed(() => kept().value);
}
