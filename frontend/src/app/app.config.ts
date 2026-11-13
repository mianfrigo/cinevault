import {
  ApplicationConfig,
  DOCUMENT,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';

import cinevaultPreset from './theme/cinevault-preset';
import { routes } from './app.routes';
import { authInterceptor } from '@core/auth/auth.interceptor';
import { API_BASE } from '@core/api/api-client';
import { AuthStore } from '@core/auth/auth.store';
import { providePrimeNgWithLicense } from '@core/config/primeng-license';
import { PageTitleStrategy } from '@core/seo/page-title.strategy';

// provideAnimationsAsync() is deprecated since Angular 20.2 and PrimeNG 22 animates through
// animate.enter/leave, so it is not registered (see task-12 report).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    MessageService,
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useExisting: PageTitleStrategy },
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideClientHydration(withEventReplay()),
    // Absolute on purpose: the HTTP transfer cache keys responses by URL, and the server (which
    // overrides this in app.config.server.ts) maps its internal API origin to this same origin.
    { provide: API_BASE, useFactory: () => `${inject(DOCUMENT).location.origin}/api/v1` },
    // Not awaited on purpose: the page paints at once and guards wait on AuthStore.ready instead.
    provideAppInitializer(() => {
      void inject(AuthStore).restoreSession();
    }),
    providePrimeNgWithLicense({
      theme: {
        preset: cinevaultPreset,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: { name: 'primeng', order: 'theme, base, primeng' },
        },
      },
    }),
  ],
};
