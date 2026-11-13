import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { loadEnv } from './server/load-env';
import { SECURITY_HEADERS, cacheControlFor, staticCacheControl } from './server/response-headers';

// Before the engine below: it reads NG_ALLOWED_HOSTS when it is created.
loadEnv(import.meta.dirname);

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.disable('x-powered-by');

/**
 * Security headers on every response, static files included.
 */
app.use((_req, res, next) => {
  res.set(SECURITY_HEADERS);
  next();
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    index: false,
    redirect: false,
    // Content-hashed build files are immutable; robots.txt and the favicon are not.
    setHeaders: (res, filePath) => res.setHeader('Cache-Control', staticCacheControl(filePath)),
  }),
);

/**
 * Handle all other requests by rendering the Angular application. Only a 200 catalog page may be cached;
 * a page that sets its own Cache-Control (not found and error pages: ResponseStatus) keeps it.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => {
      if (!response) {
        res.setHeader('Cache-Control', 'no-store');
        return next();
      }
      if (!response.headers.has('Cache-Control')) {
        res.setHeader('Cache-Control', cacheControlFor(req.path, response.status));
      }
      return writeResponseToNodeResponse(response, res);
    })
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
