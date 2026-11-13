import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The sentence TMDB requires wherever its data is shown. Size, colour and width come from the caller's classes. */
@Component({
  selector: 'cv-tmdb-credit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `<p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>`,
})
export class TmdbCreditComponent {}
