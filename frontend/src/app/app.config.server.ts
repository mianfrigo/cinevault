import {
  inject,
  mergeApplicationConfig,
  ApplicationConfig,
  REQUEST,
  TransferState,
} from '@angular/core';
import { HTTP_TRANSFER_CACHE_ORIGIN_MAP } from '@angular/common/http';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { API_BASE } from '@core/api/api-client';
import { transferCacheOriginMap } from '@core/api/transfer-cache-origin';
import { PRIMENG_LICENSE, PRIMENG_LICENSE_KEY, licenseFrom } from '@core/config/primeng-license';
import { SITE_ORIGIN, SITE_ORIGIN_KEY, siteOriginFrom } from '@core/seo/site-origin';
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
    // Canonical links and og:url: SITE_URL, else the (host-validated) request origin. The browser gets the
    // same value through transfer state, so hydration keeps it.
    {
      provide: SITE_ORIGIN,
      useFactory: () => {
        const origin = siteOriginFrom(process.env['SITE_URL'], inject(REQUEST));
        inject(TransferState).set(SITE_ORIGIN_KEY, origin);
        return origin;
      },
    },
    // PrimeNG validates its license key in the browser, so the key is handed over through transfer state.
    {
      provide: PRIMENG_LICENSE,
      useFactory: () => {
        const license = licenseFrom(process.env['PRIMENG_LICENSE_KEY']);
        if (license) inject(TransferState).set(PRIMENG_LICENSE_KEY, license);
        return license;
      },
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
