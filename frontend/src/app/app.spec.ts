import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { App } from './app';

describe('App', () => {
  it('renders the nav, the main landmark and the footer', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), MessageService],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('cv-nav')).not.toBeNull();
    expect(el.querySelector('main#main')).not.toBeNull();
    expect(el.querySelector('cv-footer')).not.toBeNull();
    expect(el.querySelector('p-toast')).not.toBeNull(); // the one toast host
    expect(el.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main');
  });
});
