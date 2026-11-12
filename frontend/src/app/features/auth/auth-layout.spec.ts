import { TestBed } from '@angular/core/testing';
import { AUTH_ART, AuthArtVariant } from './auth-art.component';
import { setup } from './auth.testing';

const PAGES: {
  url: string;
  variant: AuthArtVariant;
  tone: string;
  scene: 'sun' | 'waves';
  back: [label: string, href: string];
}[] = [
  { url: '/login', variant: 'login', tone: 'sage', scene: 'sun', back: ['Back to site', '/'] },
  {
    url: '/register',
    variant: 'register',
    tone: 'clay',
    scene: 'sun',
    back: ['Back to site', '/'],
  },
  {
    url: '/forgot-password',
    variant: 'recover',
    tone: 'teal',
    scene: 'waves',
    back: ['Back to log in', '/login'],
  },
  {
    url: '/reset-password',
    variant: 'recover',
    tone: 'teal',
    scene: 'waves',
    back: ['Back to log in', '/login'],
  },
  {
    url: '/check-email',
    variant: 'verify',
    tone: 'slate',
    scene: 'waves',
    back: ['Back to site', '/'],
  },
  {
    url: '/verify-email',
    variant: 'verify',
    tone: 'slate',
    scene: 'waves',
    back: ['Back to site', '/'],
  },
];

describe('Auth layout', () => {
  for (const page of PAGES) {
    it(`${page.url} renders the split layout with its own art, one h1, the back link and the TMDB credit`, async () => {
      const { el } = await setup(page.url);

      expect(el.querySelectorAll('h1')).toHaveLength(1);
      expect(el.querySelector('p-card')).toBeNull();

      const logo = el.querySelector('cv-logo a');
      expect(logo?.getAttribute('aria-label')).toBe('Cinevault, home');

      const back = Array.from(el.querySelectorAll('a')).find((a) =>
        a.textContent?.includes(page.back[0]),
      );
      expect(back?.getAttribute('href')).toBe(page.back[1]);

      // The art is decorative: hidden from assistive technology, the tagline is not a heading.
      const art = el.querySelector('cv-auth-art');
      const panel = art?.parentElement;
      expect(panel?.getAttribute('aria-hidden')).toBe('true');
      const tagline = panel?.querySelector('p');
      expect(tagline?.textContent?.trim()).toBe(AUTH_ART[page.variant].tagline);
      expect(panel?.querySelector('h1, h2, h3, img')).toBeNull();
      expect(el.querySelector('h1')?.textContent).not.toContain(AUTH_ART[page.variant].tagline);

      // Scene and tone come from the variant (colours are theme token references, no raw hex).
      expect(art?.querySelector('svg')?.getAttribute('style')).toContain(
        `--color-tone-${page.tone}-ground`,
      );
      expect(art?.querySelectorAll('polygon')).toHaveLength(page.scene === 'sun' ? 1 : 0);
      expect(art?.querySelectorAll('path')).toHaveLength(page.scene === 'waves' ? 4 : 0);
      expect(art?.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);

      expect(el.textContent).toContain(
        'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      );
      TestBed.resetTestingModule();
    });
  }

  it('maps each variant to its own tagline', () => {
    expect(AUTH_ART.login.tagline).toBe('Your list, on every screen.');
    expect(AUTH_ART.register.tagline).toBe('Save it now. Watch it later.');
    expect(AUTH_ART.recover.tagline).toBe('Locked out? It happens.');
    expect(AUTH_ART.verify.tagline).toBe('One click and you are in.');
  });

  it('shows the real password rule on register and reset, not the mockup rule', async () => {
    for (const url of ['/register', '/reset-password?token=abc']) {
      const { el } = await setup(url);
      expect(el.textContent).toContain('At least 10 characters, at most 128.');
      expect(el.textContent).not.toContain('one number');
      TestBed.resetTestingModule();
    }
  });

  it('links the terms and privacy placeholders from the register fine print', async () => {
    const { el } = await setup('/register');
    const hrefs = Array.from(el.querySelectorAll('form a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/terms', '/privacy']);
  });
});
