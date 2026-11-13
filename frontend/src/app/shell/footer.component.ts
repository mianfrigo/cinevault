import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { TmdbCreditComponent } from '@shared/components/tmdb-credit/tmdb-credit.component';

@Component({
  selector: 'cv-footer',
  imports: [RouterLink, LogoComponent, TmdbCreditComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="mt-16 border-t border-line-soft bg-surface-0 py-8">
      <div class="site-gutter">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <cv-logo />
          <nav aria-label="Footer" class="flex flex-wrap">
            <a
              routerLink="/terms"
              class="inline-flex min-h-11 items-center pr-4 text-sm text-fg-2 underline-offset-4 hover:text-fg hover:underline lg:min-h-10"
              >Terms</a
            >
            <a
              routerLink="/privacy"
              class="inline-flex min-h-11 items-center pr-4 text-sm text-fg-2 underline-offset-4 hover:text-fg hover:underline lg:min-h-10"
              >Privacy</a
            >
          </nav>
        </div>
        <cv-tmdb-credit
          class="mt-2 max-w-[80ch] border-t border-line-soft pt-4 text-label text-fg-3"
        />
      </div>
    </footer>
  `,
})
export class FooterComponent {}
