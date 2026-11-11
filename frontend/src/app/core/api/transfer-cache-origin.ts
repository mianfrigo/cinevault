/**
 * Maps the origin the SSR server calls the API on to the origin the browser calls it on, for
 * `HTTP_TRANSFER_CACHE_ORIGIN_MAP`. Both sides build the same request URL then, so the browser
 * finds the server's responses in the transfer state instead of fetching them again.
 * The public origin is the one the page itself was requested on (the browser's `location.origin`).
 */
export function transferCacheOriginMap(
  apiInternalUrl: string,
  request: Request | null,
): Record<string, string> {
  if (!request) return {};
  return { [new URL(apiInternalUrl).origin]: new URL(request.url).origin };
}
