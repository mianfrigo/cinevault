import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SeoService, pageTitle } from '@core/seo/seo.service';
import { ResponseStatus } from '@core/ssr/response-status.service';

@Component({
  selector: 'cv-not-found',
  imports: [RouterLink, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="site-gutter grid justify-items-start gap-4 py-16">
      <h1 class="text-h1 text-fg">Page not found</h1>
      <p class="max-w-[60ch] text-fg-2">
        This page does not exist or has moved. Check the address, or go back to the home page.
      </p>
      <p-button label="Go to home" routerLink="/" />
    </section>
  `,
})
export default class NotFoundComponent {
  constructor() {
    // The same page everywhere it shows (the `**` route, an unknown title), so it answers 404 here.
    inject(ResponseStatus).set(404);
    inject(SeoService).set({ title: pageTitle('Page not found'), noindex: true });
  }
}
