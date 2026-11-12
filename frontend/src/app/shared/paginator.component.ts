import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

interface Item {
  key: string;
  page: number | null;
  edge: boolean;
}

const WINDOW = 5;

/**
 * Page navigation: Prev, up to five numbered buttons around the current page, the first and last
 * page with ellipses, Next. Built from scratch with Tailwind (owner decision), generic over the
 * data it pages. Below `sm` only Prev, the five numbers and Next are shown so they fit 44px targets.
 */
@Component({
  selector: 'cv-paginator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 1) {
      <nav aria-label="Pagination" class="mt-8 flex items-center justify-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          [class]="btn"
          [disabled]="current() === 1"
          (click)="go(current() - 1)"
        >
          <i class="pi pi-angle-left" aria-hidden="true"></i>
          <span class="max-sm:hidden">Prev</span>
        </button>
        <ul class="flex items-center gap-1">
          @for (item of items(); track item.key) {
            <li [class]="item.edge ? 'max-sm:hidden' : ''">
              @if (item.page === null) {
                <span aria-hidden="true" class="grid min-h-11 min-w-8 place-items-center text-fg-3"
                  >…</span
                >
              } @else {
                <button
                  type="button"
                  [attr.aria-label]="'Page ' + item.page"
                  [attr.aria-current]="item.page === current() ? 'page' : null"
                  [class]="item.page === current() ? btn + ' ' + active : btn"
                  (click)="go(item.page)"
                >
                  {{ item.page }}
                </button>
              }
            </li>
          }
        </ul>
        <button
          type="button"
          aria-label="Next page"
          [class]="btn"
          [disabled]="current() === total()"
          (click)="go(current() + 1)"
        >
          <span class="max-sm:hidden">Next</span>
          <i class="pi pi-angle-right" aria-hidden="true"></i>
        </button>
      </nav>
    }
  `,
})
export class PaginatorComponent {
  /** Current page, 1-based. */
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly pageChange = output<number>();

  protected readonly btn =
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-fg-2 tabular-nums transition-colors duration-150 hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-40';
  protected readonly active =
    'border-accent bg-accent text-on-accent hover:bg-accent hover:text-on-accent';

  protected readonly total = computed(() => {
    const t = Math.trunc(this.totalPages());
    return Number.isFinite(t) && t > 0 ? t : 0;
  });

  protected readonly current = computed(() =>
    Math.min(Math.max(Math.trunc(this.page()) || 1, 1), Math.max(this.total(), 1)),
  );

  protected readonly items = computed<Item[]>(() => {
    const total = this.total();
    const start = Math.max(1, Math.min(this.current() - 2, total - WINDOW + 1));
    const end = Math.min(total, start + WINDOW - 1);
    const page = (n: number, edge = false): Item => ({ key: `p${n}`, page: n, edge });
    const gap = (key: string): Item => ({ key, page: null, edge: true });

    const items: Item[] = [];
    if (start > 1) {
      items.push(page(1, true));
      if (start > 2) items.push(gap('gap-start'));
    }
    for (let n = start; n <= end; n++) items.push(page(n));
    if (end < total) {
      if (end < total - 1) items.push(gap('gap-end'));
      items.push(page(total, true));
    }
    return items;
  });

  protected go(page: number): void {
    if (page !== this.current() && page >= 1 && page <= this.total()) this.pageChange.emit(page);
  }
}
