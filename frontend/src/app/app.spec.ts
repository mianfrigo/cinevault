import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { App } from './app';
import { routes } from './app.routes';

@Component({ selector: 'cv-test-page', template: '<h1>Page</h1>' })
class TestPage {}

function render() {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([
        { path: '', component: TestPage },
        { path: 'auth', component: TestPage, data: { chromeless: true } },
      ]),
      MessageService,
    ],
  });
  return TestBed.createComponent(App);
}

describe('App', () => {
  it('renders the nav, the main landmark and the footer', async () => {
    const fixture = render();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('cv-nav')).not.toBeNull();
    expect(el.querySelector('main#main')).not.toBeNull();
    expect(el.querySelector('cv-footer')).not.toBeNull();
    expect(el.querySelector('p-toast')).not.toBeNull(); // the one toast host
    expect(el.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main');
  });

  it('leaves out the nav and footer on a chromeless route and brings them back elsewhere', async () => {
    const fixture = render();
    const router = TestBed.inject(Router);
    const el = fixture.nativeElement as HTMLElement;

    await router.navigateByUrl('/auth');
    await fixture.whenStable();
    expect(el.querySelector('cv-nav')).toBeNull();
    expect(el.querySelector('cv-footer')).toBeNull();
    expect(el.querySelector('main#main h1')).not.toBeNull();
    expect(el.querySelector('a.skip-link')).not.toBeNull();

    await router.navigateByUrl('/');
    await fixture.whenStable();
    expect(el.querySelector('cv-nav')).not.toBeNull();
    expect(el.querySelector('cv-footer')).not.toBeNull();
  });

  it('marks exactly the six auth pages chromeless', () => {
    const chromeless = routes.filter((r) => r.data?.['chromeless']).map((r) => r.path);
    expect(chromeless.sort()).toEqual(
      [
        'check-email',
        'forgot-password',
        'login',
        'register',
        'reset-password',
        'verify-email',
      ].sort(),
    );
  });
});
