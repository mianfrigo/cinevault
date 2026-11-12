import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from '@core/auth/auth.store';
import { UserMenuComponent } from '../../shell/user-menu.component';
import { member } from './dashboard.testing';
import DashboardShell from './dashboard-shell.component';

// Both logout paths leave the page first (so a pending removal is sent with a valid session); a
// failing navigation (a lazy chunk that cannot load) must never keep the user logged in.
describe('Log out when the navigation to / fails', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthStore).setUser(member);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockRejectedValue(new Error('chunk failed'));
    return TestBed.inject(HttpTestingController);
  }

  async function expectLoggedOut(http: HttpTestingController) {
    const req = await vi.waitFor(() => http.expectOne('/api/v1/auth/logout'));
    req.flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() => expect(TestBed.inject(AuthStore).isLoggedIn()).toBe(false));
  }

  it('the dashboard shell still logs the user out', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(DashboardShell);
    fixture.detectChanges();
    const logout = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Log out'))!;
    logout.click();
    await expectLoggedOut(http);
  });

  it('the account menu still logs the user out', async () => {
    const http = setup();
    const fixture = TestBed.createComponent(UserMenuComponent);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('button[aria-label="Account menu"]')!
      .click();
    const item = await vi.waitFor(() => {
      const a = Array.from(document.querySelectorAll<HTMLElement>('.p-menu-item-link')).find((x) =>
        x.textContent?.includes('Log out'),
      );
      expect(a).toBeDefined();
      return a!;
    });
    item.click();
    await expectLoggedOut(http);
  });
});
