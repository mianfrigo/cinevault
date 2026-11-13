import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthStore } from './auth.store';
import { injectLogout } from './logout';

describe('injectLogout', () => {
  function setup(navigate: () => Promise<boolean>) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const calls: string[] = [];
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation(async () => {
      calls.push('navigate');
      return navigate();
    });
    vi.spyOn(TestBed.inject(AuthStore), 'logout').mockImplementation(async () => {
      calls.push('logout');
    });
    return { calls, logout: TestBed.runInInjectionContext(() => injectLogout()) };
  }

  it('leaves the page first, then ends the session', async () => {
    const { calls, logout } = setup(async () => true);
    await logout();
    expect(calls).toEqual(['navigate', 'logout']);
  });

  it('still ends the session when the navigation fails', async () => {
    const { calls, logout } = setup(() => Promise.reject(new Error('chunk failed')));
    await logout();
    expect(calls).toEqual(['navigate', 'logout']);
  });
});
