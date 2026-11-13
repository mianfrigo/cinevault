import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageHeaderComponent } from './page-header.component';

@Component({
  imports: [PageHeaderComponent],
  template: `
    <cv-page-header title="Library" [lead]="lead" [compact]="compact">
      <button slot="actions" type="button">Filter</button>
    </cv-page-header>
  `,
})
class HostComponent {
  lead: string | undefined = 'Everything you saved.';
  compact = false;
  readonly header = viewChild.required(PageHeaderComponent);
}

function setup(lead?: string | undefined, compact = false) {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.lead = lead;
  fixture.componentInstance.compact = compact;
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('PageHeaderComponent', () => {
  it('renders the title as the page h1 and the lead under it', () => {
    const { el } = setup('Everything you saved.');
    const h1 = el.querySelector('h1');
    expect(h1?.textContent?.trim()).toBe('Library');
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    expect(h1?.nextElementSibling?.textContent).toBe('Everything you saved.');
  });

  it('renders no lead line when none is given, but keeps the line for an empty lead', () => {
    expect(setup(undefined).el.querySelector('h1 + p')).toBeNull();
    const empty = setup('').el.querySelector('h1 + p');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toBe('');
  });

  it('projects the actions slot', () => {
    const { el } = setup();
    expect(el.querySelector('header button[slot=actions]')?.textContent).toBe('Filter');
  });

  it('does not leave the title as a tooltip on the host', () => {
    const { el } = setup();
    expect(el.querySelector('cv-page-header')?.hasAttribute('title')).toBe(false);
  });

  it('uses the tighter bottom space on a phone only when compact', () => {
    expect(setup(undefined, false).el.querySelector('header')?.className).toContain('mb-8');
    const compact = setup(undefined, true).el.querySelector('header')?.className;
    expect(compact).toContain('mb-6');
    expect(compact).toContain('md:mb-8');
  });

  it('makes the h1 focusable by script and focus() moves keyboard focus to it', () => {
    const { fixture, el } = setup();
    document.body.appendChild(el);
    const h1 = el.querySelector('h1')!;
    expect(h1.getAttribute('tabindex')).toBe('-1');
    fixture.componentInstance.header().focus();
    expect(document.activeElement).toBe(h1);
    el.remove();
  });
});
