import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from './logo.component';

@Component({
  selector: 'cv-footer',
  imports: [RouterLink, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="mt-16 border-t border-line-soft bg-surface-0 py-8">
      <div class="mx-auto max-w-site px-6 md:px-8 xl:px-12">
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
        <div class="mt-2 max-w-[80ch] border-t border-line-soft pt-4 text-label text-fg-3">
          <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </div>
      </div>
    </footer>
  `,
})
export class FooterComponent {}
