import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SectionHeaderComponent } from './section-header.component';

@Component({
  imports: [SectionHeaderComponent],
  template: `
    <cv-section-header
      heading="Recent signups"
      headingId="h-recent"
      [link]="link"
      linkLabel="View all"
    >
      <button type="button">Extra</button>
    </cv-section-header>
  `,
})
class HostComponent {
  link: string[] | undefined = ['/admin', 'users'];
}

function render(link?: string[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.link = link;
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SectionHeaderComponent', () => {
  it('renders the heading as an h2 with the given id', () => {
    const h2 = render().querySelector('h2');
    expect(h2?.textContent).toBe('Recent signups');
    expect(h2?.id).toBe('h-recent');
  });

  it('projects extra controls and renders the link with its label', () => {
    const el = render(['/admin', 'users']);
    expect(el.querySelector('button')?.textContent).toBe('Extra');
    const a = el.querySelector('a');
    expect(a?.getAttribute('href')).toBe('/admin/users');
    expect(a?.textContent).toContain('View all');
  });

  it('renders no link without one, and no id attribute without an id', () => {
    const el = render(undefined);
    expect(el.querySelector('a')).toBeNull();

    const fixture = TestBed.createComponent(SectionHeaderComponent);
    fixture.componentRef.setInput('heading', 'Top cast');
    fixture.detectChanges();
    const h2 = (fixture.nativeElement as HTMLElement).querySelector('h2');
    expect(h2?.hasAttribute('id')).toBe(false);
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  });

  it('labels the link "See all" by default', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(SectionHeaderComponent);
    fixture.componentRef.setInput('heading', 'Trending');
    fixture.componentRef.setInput('link', ['/movies']);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a')?.textContent).toContain('See all');
  });
});
