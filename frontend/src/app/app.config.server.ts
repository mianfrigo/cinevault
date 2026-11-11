import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { API_BASE } from './core/api/api-client';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // The SSR server calls the API directly, not through the public origin.
    {
      provide: API_BASE,
      useFactory: () => `${process.env['API_INTERNAL_URL'] ?? 'http://localhost:3000'}/api/v1`,
    },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
