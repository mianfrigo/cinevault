// The reverse proxy every real deployment needs in front of the SSR server: `/api/**` goes to the API,
// everything else to the SSR server, on one origin (the app calls the API at `location.origin/api/v1`).
// The Host header is passed through unchanged (the SSR server validates it against NG_ALLOWED_HOSTS).
// It also compresses text responses (brotli, gzip) like nginx, Caddy or a CDN would: neither the SSR
// server nor the API compresses, so a production proxy has to (see docs/launch-checklist.md).
import { createServer, request } from 'node:http';
import { constants, createBrotliCompress, createGzip } from 'node:zlib';

const COMPRESSIBLE =
  /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg\+xml|font\/(ttf|otf))/;

export function createProxy({ api, ssr }) {
  return createServer((req, res) => {
    const port = req.url?.startsWith('/api/') ? api : ssr;
    const upstream = request(
      { host: '127.0.0.1', port, method: req.method, path: req.url, headers: req.headers },
      (up) => {
        const headers = { ...up.headers };
        const accepts = String(req.headers['accept-encoding'] ?? '');
        const encoding = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : null;
        const compress =
          encoding &&
          req.method !== 'HEAD' &&
          !headers['content-encoding'] &&
          COMPRESSIBLE.test(String(headers['content-type'] ?? '')) &&
          ![204, 304].includes(up.statusCode ?? 0);
        if (!compress) {
          res.writeHead(up.statusCode ?? 502, headers);
          up.pipe(res);
          return;
        }
        delete headers['content-length'];
        headers['content-encoding'] = encoding;
        headers.vary = headers.vary ? `${headers.vary}, Accept-Encoding` : 'Accept-Encoding';
        res.writeHead(up.statusCode ?? 502, headers);
        const encoder =
          encoding === 'br'
            ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
            : createGzip({ level: 6 });
        up.pipe(encoder).pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('bad gateway');
    });
    req.pipe(upstream);
  });
}
