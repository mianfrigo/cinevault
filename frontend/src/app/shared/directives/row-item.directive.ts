import { Directive, inject, input, TemplateRef } from '@angular/core';

/**
 * Marks the `<ng-template let-item>` that renders a row item, and types its context: bind it to the
 * same array as the row's `items` (`<ng-template [cvRowItem]="items" let-item>`) so `item` is typed.
 */
@Directive({ selector: 'ng-template[cvRowItem]' })
export class RowItemDirective<T> {
  readonly cvRowItem = input.required<readonly T[]>();
  readonly template = inject<TemplateRef<{ $implicit: T }>>(TemplateRef);

  // Type-only guard Angular's template checker calls; the predicate uses the parameter as a type.
  static ngTemplateContextGuard<T>(
    _dir: RowItemDirective<T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ctx: unknown,
  ): ctx is { $implicit: T } {
    return true;
  }
}
