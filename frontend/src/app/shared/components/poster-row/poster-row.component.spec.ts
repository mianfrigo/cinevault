import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TitleSummary } from '@core/models';
import { PosterRowComponent } from './poster-row.component';
import { RowItemDirective } from '@shared/directives/row-item.directive';

const title = (tmdbId: number): TitleSummary => ({
  tmdbId,
  mediaType: 'movie',
  title: `Title ${tmdbId}`,
  year: 2024,
  rating: 7,
  posterUrl: null,
  backdropUrl: null,
  overview: null,
});

@Component({
  imports: [PosterRowComponent],
  template: `<cv-poster-row heading="More like this" [items]="items()" />`,
})
class PostersHost {
  readonly items = signal([1, 2, 3].map(title));
}

@Component({
  imports: [PosterRowComponent, RowItemDirective],
  template: `
    <cv-poster-row heading="Things" [items]="things()" [trackKey]="byId">
      <ng-template [cvRowItem]="things()" let-t
        ><b class="thing">{{ t.id }}</b></ng-template
      >
    </cv-poster-row>
  `,
})
class ThingsHost {
  readonly things = signal([{ id: 1 }, { id: 2 }, { id: 3 }]);
  readonly byId = (t: { id: number }) => t.id;
}

describe('PosterRowComponent', () => {
  beforeEach(() => {
    // jsdom has no layout, so p-carousel's observers and scrollTo are stubbed (it only needs them to exist).
    Object.defineProperty(Element.prototype, 'scrollTo', {
      configurable: true,
      value: () => undefined,
    });
    const observer = class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    };
    vi.stubGlobal('ResizeObserver', observer);
    vi.stubGlobal('IntersectionObserver', observer);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('matches poster cards by title identity when the items change', async () => {
    const fixture = TestBed.createComponent(PostersHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const cards = () => Array.from(el.querySelectorAll('cv-poster-card'));
    const [, two, three] = cards();

    fixture.componentInstance.items.set([2, 3, 4].map(title)); // like navigating between "More like this" rows
    await fixture.whenStable();

    expect(cards().length).toBe(3);
    expect(cards()[0]).toBe(two);
    expect(cards()[1]).toBe(three);
  });

  it('renders a given item template with the supplied identity key', async () => {
    const fixture = TestBed.createComponent(ThingsHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const things = () => Array.from(el.querySelectorAll('.thing'));
    expect(things().map((t) => t.textContent)).toEqual(['1', '2', '3']);
    expect(el.querySelector('cv-poster-card')).toBeNull();
    const [, b] = things();

    fixture.componentInstance.things.set([{ id: 2 }, { id: 3 }]);
    await fixture.whenStable();

    expect(things()[0]).toBe(b);
  });
});
