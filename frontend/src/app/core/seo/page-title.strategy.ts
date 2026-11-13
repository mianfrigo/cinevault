import { Injectable, inject } from '@angular/core';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { SeoService, pageTitle } from './seo.service';

/**
 * Sets the document head of every route that has a static `title`: "{title} | Cinevault". A route with
 * data `noindex` (the private and utility pages) is also marked noindex, nofollow. Routes without a
 * `title` name themselves through SeoService (home, title, genre, search, not found).
 */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly seo = inject(SeoService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    if (title === undefined) return;
    let noindex = false;
    // The whole chain is read: a parent's data does not reach its children (the dashboard shell).
    for (let route = snapshot.root; route; route = route.firstChild as typeof route) {
      noindex ||= route.data['noindex'] === true;
    }
    this.seo.set({ title: pageTitle(title), path: snapshot.url.split(/[?#]/)[0], noindex });
  }
}
