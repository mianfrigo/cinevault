import { inject, mergeApplicationConfig, ApplicationConfig, REQUEST } from '@angular/core';
import { HTTP_TRANSFER_CACHE_ORIGIN_MAP } from '@angular/common/http';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { API_BASE } from './core/api/api-client';
import { transferCacheOriginMap } from './core/api/transfer-cache-origin';
import { serverRoutes } from './app.routes.server';

const apiInternalUrl = () => process.env['API_INTERNAL_URL'] ?? 'http://localhost:3000';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // The SSR server calls the API directly, not through the public origin.
    { provide: API_BASE, useFactory: () => `${apiInternalUrl()}/api/v1` },
    // ...so its requests would not match the browser's (public origin) and the browser would fetch
    // everything again. The map must only be provided on the server (Angular throws on the client).
    {
      provide: HTTP_TRANSFER_CACHE_ORIGIN_MAP,
      useFactory: () => transferCacheOriginMap(apiInternalUrl(), inject(REQUEST)),
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
