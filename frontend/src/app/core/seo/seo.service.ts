import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { cutUnits } from '@shared/utils/cut-units';
import { SITE_ORIGIN } from './site-origin';

export const SITE_NAME = 'Cinevault';
const DEFAULT_DESCRIPTION = 'Browse movies and series, read details and keep a favorites list.';
const MAX_DESCRIPTION = 160;

/** "Movies" -> "Movies | Cinevault". */
export function pageTitle(name: string): string {
  return `${name} | ${SITE_NAME}`;
}

/** Whitespace collapsed, at most 160 characters (cut between code points), "…" when cut. */
function clampDescription(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= MAX_DESCRIPTION
    ? flat
    : cutUnits(flat, MAX_DESCRIPTION - 1).trimEnd() + '…';
}

export interface SeoPage {
  /** The full document title. */
  title: string;
  description?: string | null;
  /** Absolute http(s) image URL for link previews; the og:image tag is left out when empty or not such a URL. */
  image?: string | null;
  /** Path of this page on the site ("/title/movie/603"); the canonical link is origin + path. */
  path?: string;
  /** Open Graph type; "website" by default. */
  type?: string;
  /** Private or utility page: robots noindex, nofollow, and no canonical link (so no path needed). */
  noindex?: boolean;
}

/**
 * Document head for the current page: title, description, canonical, Open Graph, Twitter card, robots.
 * `set` describes the whole head, so tags from the previous page never linger after a route change.
 * Everything goes through Title, Meta and DOCUMENT (also on the server) as text or attribute values.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly origin = inject(SITE_ORIGIN);

  set(page: SeoPage): void {
    const description = clampDescription(page.description || DEFAULT_DESCRIPTION);
    const canonical =
      page.noindex || page.path === undefined ? null : this.origin.replace(/\/$/, '') + page.path;

    // Only an absolute http(s) URL is a usable preview image.
    const image = page.image && /^https?:/i.test(page.image) ? page.image : null;

    this.titleService.setTitle(page.title);
    this.tag('name', 'description', description);
    this.tag('name', 'robots', page.noindex ? 'noindex, nofollow' : null);
    this.tag('property', 'og:site_name', SITE_NAME);
    this.tag('property', 'og:type', page.type ?? 'website');
    this.tag('property', 'og:title', page.title);
    this.tag('property', 'og:description', description);
    this.tag('property', 'og:url', canonical);
    this.tag('property', 'og:image', image);
    this.tag('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    this.canonical(canonical);
  }

  /** Writes the tag in place (one per name), or removes it when there is no content. */
  private tag(attr: 'name' | 'property', key: string, content: string | null): void {
    const selector = `${attr}="${key}"`;
    if (content) this.meta.updateTag({ [attr]: key, content }, selector);
    else this.meta.removeTag(selector);
  }

  private canonical(href: string | null): void {
    const head = this.document.head;
    const link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!href) return link?.remove();
    const el = link ?? head.appendChild(this.document.createElement('link'));
    el.setAttribute('rel', 'canonical');
    el.setAttribute('href', href);
  }
}
