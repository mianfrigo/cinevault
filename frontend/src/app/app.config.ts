import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { providePrimeNG } from 'primeng/config';

import cinevaultPreset from './theme/cinevault-preset';
import { routes } from './app.routes';

// provideAnimationsAsync() is deprecated since Angular 20.2 and PrimeNG 22 animates through
// animate.enter/leave, so it is not registered (see task-12 report).
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(withEventReplay()),
    providePrimeNG({
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
