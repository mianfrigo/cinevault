import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SeoService } from './seo.service';
import { SITE_ORIGIN } from './site-origin';

describe('SeoService', () => {
  let seo: SeoService;
  let doc: Document;

  const content = (selector: string) =>
    doc.head.querySelector(selector)?.getAttribute('content') ?? null;
  const canonical = () => doc.head.querySelector('link[rel="canonical"]')?.getAttribute('href');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: SITE_ORIGIN, useValue: 'https://cinevault.test' }],
    });
    seo = TestBed.inject(SeoService);
    doc = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    doc.head
      .querySelectorAll('meta[name], meta[property], link[rel="canonical"]')
      .forEach((el) => el.remove());
    doc.title = '';
  });

  it('writes title, description, canonical and og tags', () => {
    seo.set({
      title: 'Dune (2021) | Cinevault',
      description: 'A noble family goes to war.',
      image: 'https://image.tmdb.org/t/p/w1280/dune.jpg',
      path: '/title/movie/438631',
      type: 'video.movie',
    });

    expect(doc.title).toBe('Dune (2021) | Cinevault');
    expect(content('meta[name="description"]')).toBe('A noble family goes to war.');
    expect(canonical()).toBe('https://cinevault.test/title/movie/438631');
    expect(content('meta[property="og:title"]')).toBe('Dune (2021) | Cinevault');
    expect(content('meta[property="og:description"]')).toBe('A noble family goes to war.');
    expect(content('meta[property="og:image"]')).toBe('https://image.tmdb.org/t/p/w1280/dune.jpg');
    expect(content('meta[property="og:type"]')).toBe('video.movie');
    expect(content('meta[property="og:url"]')).toBe('https://cinevault.test/title/movie/438631');
    expect(content('meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(content('meta[name="robots"]')).toBeNull();
  });

  it('omits og:image when the image is null, and drops one left by the previous page', () => {
    seo.set({ title: 'A', image: 'https://image.tmdb.org/a.jpg', path: '/a' });
    seo.set({ title: 'B', image: null, path: '/b' });

    expect(doc.head.querySelector('meta[property="og:image"]')).toBeNull();
    expect(content('meta[name="twitter:card"]')).toBe('summary');
  });

  it.each(['/t/p/w500/relative.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA', ''])(
    'omits og:image for %j, which is not an absolute http(s) URL',
    (image) => {
      seo.set({ title: 'A', image, path: '/a' });

      expect(doc.head.querySelector('meta[property="og:image"]')).toBeNull();
      expect(content('meta[name="twitter:card"]')).toBe('summary');
    },
  );

  it('updates the tags on a second call instead of adding duplicates', () => {
    seo.set({ title: 'A', description: 'one', path: '/a' });
    seo.set({ title: 'B', description: 'two', path: '/b' });

    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:type"]',
      'link[rel="canonical"]',
    ]) {
      expect(doc.head.querySelectorAll(selector).length).toBe(1);
    }
    expect(content('meta[name="description"]')).toBe('two');
    expect(canonical()).toBe('https://cinevault.test/b');
  });

  it('falls back to the site description when there is none', () => {
    seo.set({ title: 'Movies | Cinevault', description: null, path: '/movies' });
    expect(content('meta[name="description"]')).toContain('Browse movies and series');
  });

  it('collapses whitespace and limits the description to 160 characters', () => {
    seo.set({ title: 'T', description: `  a \n\n b ${'word '.repeat(60)}`, path: '/t' });
    const text = content('meta[name="description"]') ?? '';

    expect(text.startsWith('a b word')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text.endsWith('…')).toBe(true);
  });

  it('does not cut a surrogate pair when limiting the description', () => {
    seo.set({ title: 'T', description: '😀'.repeat(200), path: '/t' });
    const text = content('meta[name="description"]') ?? '';

    expect(text.length).toBeLessThanOrEqual(160);
    // A lone surrogate would not survive a round trip through UTF-8.
    expect(new TextDecoder().decode(new TextEncoder().encode(text))).toBe(text);
  });

  it('marks a private page noindex and leaves out the canonical link', () => {
    seo.set({ title: 'A', path: '/a' });
    seo.set({ title: 'Dashboard | Cinevault', path: '/dashboard/favorites', noindex: true });

    expect(content('meta[name="robots"]')).toBe('noindex, nofollow');
    expect(canonical()).toBeUndefined();

    seo.set({ title: 'Movies | Cinevault', path: '/movies' });
    expect(doc.head.querySelector('meta[name="robots"]')).toBeNull();
    expect(canonical()).toBe('https://cinevault.test/movies');
  });

  it('keeps markup in values as text', () => {
    seo.set({
      title: '<img src=x onerror=alert(1)>',
      description: '"><script>x</script>',
      path: '/x',
    });

    expect(doc.title).toBe('<img src=x onerror=alert(1)>');
    expect(doc.head.querySelector('script, img')).toBeNull();
    expect(content('meta[name="description"]')).toBe('"><script>x</script>');
  });
});
