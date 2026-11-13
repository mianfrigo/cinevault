import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SeasonsComponent } from './seasons.component';
import { season1, season2, series } from './title.testing';

describe('SeasonsComponent', () => {
  let http: HttpTestingController;

  function render() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SeasonsComponent);
    fixture.componentRef.setInput('tvId', 1399);
    fixture.componentRef.setInput('seasons', series.seasonList);
    fixture.detectChanges();
    return fixture;
  }

  const season = (n: number) => `/api/v1/catalog/tv/1399/season/${n}`;
  const header = (el: HTMLElement, name: string) =>
    Array.from(el.querySelectorAll<HTMLElement>('p-accordion-header')).find((h) =>
      h.textContent?.includes(name),
    )!;

  afterEach(() => http.verify());

  it('Seasons accordion requests season 2 only when its panel is opened', async () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    // the first panel is open on load; the second is not requested yet
    http.expectOne(season(1)).flush(season1);
    http.expectNone(season(2));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Winter-over');
    expect(el.textContent).toContain('2 episodes');

    header(el, 'Season 2').click();
    fixture.detectChanges();
    http.expectOne(season(2)).flush(season2);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Thaw');

    // closing and reopening a panel does not request it again
    header(el, 'Season 2').click();
    fixture.detectChanges();
    header(el, 'Season 2').click();
    fixture.detectChanges();
    http.expectNone(season(2));
  });

  it('labels each panel with its name (or "Season N") and a singular or plural episode count', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(SeasonsComponent);
    fixture.componentRef.setInput('tvId', 1399);
    fixture.componentRef.setInput('seasons', [
      { number: 1, name: 'Specials', episodeCount: 1 },
      { number: 2, name: '', episodeCount: 8 },
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const headers = Array.from(el.querySelectorAll('p-accordion-header')).map((h) =>
      h.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(headers).toEqual(['Specials 1 episode', 'Season 2 8 episodes']);
    http.expectOne(season(1)).flush(season1);
  });

  it('shows a loading state, then an error with Retry for a season that fails', async () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    http.expectOne(season(1)).flush(null, { status: 502, statusText: 'TMDB_UNAVAILABLE' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Retry'))!
      .click();
    fixture.detectChanges();
    http.expectOne(season(1)).flush(season1);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.textContent).toContain('Resupply');
  });

  it('renders episodes without an air date or overview and never prints "null"', async () => {
    const fixture = render();
    http.expectOne(season(1)).flush(season1);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Resupply');
    expect(text).not.toMatch(/undefined|null/);
  });
});
