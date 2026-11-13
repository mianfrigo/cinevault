import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Stand-in for every screen that a later task builds; routes pass `heading` and `note` as data.
@Component({
  selector: 'cv-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="site-gutter py-12">
      <h1 class="text-h1 text-fg">{{ heading() }}</h1>
      <p class="mt-4 max-w-[60ch] text-fg-2">{{ note() }}</p>
    </section>
  `,
})
export default class PlaceholderComponent {
  readonly heading = input('');
  readonly note = input('This screen is not built yet.');
}
