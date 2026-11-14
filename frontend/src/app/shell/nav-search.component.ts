import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField, FormRoot, requiredError, validate } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';

/**
 * The search box of the nav bar, a Signal Form. The nav loads and hydrates it on first use (a deferred
 * block), so Angular Forms stays out of the initial bundle of every page. On a phone the nav's toggle
 * opens it: `open` shows the panel and moves focus into the box.
 */
@Component({
  selector: 'cv-nav-search',
  imports: [FormField, FormRoot, IconFieldModule, InputIconModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The form is the layout child of the nav bar: the host element adds no box of its own.
  host: { class: 'contents' },
  template: `
    <!-- Signal Forms hands PrimeNG the raw invalid state, so the empty box would be red. The search
         never shows a field error (a blank query just does not submit): the invalid tokens stay neutral. -->
    <form
      role="search"
      autocomplete="off"
      class="absolute inset-x-0 top-full border-b border-line-soft bg-surface-1 px-6 pt-2 pb-4 md:px-8 lg:static lg:ml-auto lg:block lg:w-80 lg:border-0 lg:bg-transparent lg:p-0 [--p-inputtext-invalid-border-color:var(--p-inputtext-border-color)] [--p-inputtext-invalid-placeholder-color:var(--p-inputtext-placeholder-color)]"
      [class.hidden]="!open()"
      [formRoot]="searchForm"
      (keydown.escape)="dismissed.emit()"
    >
      <label for="nav-search" class="sr-only">Search movies and shows</label>
      <p-iconfield class="block">
        <p-inputicon class="pi pi-search" />
        <input
          #q
          id="nav-search"
          [formField]="searchForm.q"
          pInputText
          type="search"
          class="w-full"
          placeholder="Search movies and shows"
          enterkeyhint="search"
        />
      </p-iconfield>
    </form>
  `,
})
export class NavSearchComponent {
  private readonly router = inject(Router);
  private readonly box = viewChild.required<ElementRef<HTMLInputElement>>('q');

  /** The phone panel is open. On a laptop the box is always shown. */
  readonly open = input.required<boolean>();
  /** The query was sent: the nav closes the phone panel. */
  readonly submitted = output<void>();
  /** Escape was pressed in the box: the nav closes the panel and focuses its toggle. */
  readonly dismissed = output<void>();

  private readonly model = signal({ q: '' });
  protected readonly searchForm = form(
    this.model,
    (path) => validate(path.q, ({ value }) => (value().trim() ? undefined : requiredError())),
    {
      submission: {
        action: async (f) => {
          this.submitted.emit();
          await this.router.navigate(['/search'], { queryParams: { q: f.q().value().trim() } });
        },
      },
    },
  );

  constructor() {
    // Opening the phone panel puts the caret in the box.
    afterRenderEffect(() => {
      if (this.open()) this.box().nativeElement.focus();
    });
  }
}
