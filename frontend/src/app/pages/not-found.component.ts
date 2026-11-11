import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'cv-not-found',
  imports: [RouterLink, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto grid max-w-site justify-items-start gap-4 px-6 py-16 md:px-8 xl:px-12">
      <h1 class="text-h1 text-fg">Page not found</h1>
      <p class="max-w-[60ch] text-fg-2">
        This page does not exist or has moved. Check the address, or go back to the home page.
      </p>
      <p-button label="Go to home" routerLink="/" />
    </section>
  `,
})
export default class NotFoundComponent {}
