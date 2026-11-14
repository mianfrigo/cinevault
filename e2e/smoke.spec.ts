import {
  expect,
  test as base,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { deleteMessagesTo, waitForVerifyLink } from './mailpit.mjs';
import { WEB_ORIGIN } from './stack.mjs';
import {
  FAILING_ID,
  FIXTURE_MOVIE_ID,
  FIXTURE_MOVIE_OVERVIEW,
  FIXTURE_MOVIE_TITLE,
  NOT_FOUND_ID,
} from './stub-tmdb.mjs';

const BASE = WEB_ORIGIN;
const TITLE_PATH = `/title/movie/${FIXTURE_MOVIE_ID}`;

// One user per run. Fake address on a reserved domain; the name carries the suffix so the admin
// table row and its buttons ("Block <name>") are unique.
const suffix = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const user = {
  name: `E2E Tester ${suffix}`,
  email: `e2e-${suffix}@example.test`,
  password: `Pw-${suffix}-ok1`,
};
const admin = () => ({
  email: process.env.E2E_ADMIN_EMAIL!,
  password: process.env.E2E_ADMIN_PASSWORD!,
});

// 1x1 transparent PNG: stands in for every TMDB image (the stub's paths do not exist on image.tmdb.org).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Same offline-safe network for every browser context: placeholder images, empty Google Fonts CSS. */
async function stubExternal(context: BrowserContext) {
  await context.route('https://image.tmdb.org/**', (r) =>
    r.fulfill({ contentType: 'image/png', body: PNG }),
  );
  await context.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ contentType: 'text/css', body: '' }),
  );
  await context.route('https://fonts.gstatic.com/**', (r) => r.abort());
}

const test = base.extend({
  context: async ({ context }, use) => {
    await stubExternal(context);
    await use(context);
  },
});

/**
 * Opens a page and waits until the app has booted in the browser: its first call is the session
 * restore (POST /auth/refresh). Typing earlier would be wiped when hydration rebuilds the form.
 */
async function gotoBooted(page: Page, path: string) {
  const booted = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/auth/refresh') && r.request().method() === 'POST',
  );
  await page.goto(path);
  await booted;
}

async function logIn(page: Page, email: string, password: string) {
  await gotoBooted(page, '/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  return request.post('/api/v1/auth/login', { data: { email, password } });
}

test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ playwright }) => {
  // Leave nothing behind even when a test failed half way: delete the user through the admin API
  // (a no-op after the UI delete) and the mails this run sent to its address.
  const api = await playwright.request.newContext({ baseURL: BASE });
  try {
    const login = await apiLogin(api, admin().email, admin().password);
    if (login.ok()) {
      const { accessToken } = await login.json();
      const headers = { authorization: `Bearer ${accessToken}` };
      const list = await api.get(`/api/v1/admin/users?q=${encodeURIComponent(user.email)}`, {
        headers,
      });
      const { items } = (await list.json()) as { items: { id: string; email: string }[] };
      for (const u of items.filter((i) => i.email === user.email)) {
        await api.delete(`/api/v1/admin/users/${u.id}`, { headers });
      }
    }
  } finally {
    await api.dispose();
    await deleteMessagesTo(user.email);
  }
});

test.describe('user journey', () => {
  test('register, verify through Mailpit, log in, add a title to My List, see it in Favorites, log out', async ({
    page,
    request,
    browser,
  }) => {
    await test.step('register through the UI', async () => {
      await gotoBooted(page, '/register');
      await page.getByLabel('Name').fill(user.name);
      await page.getByLabel('Email', { exact: true }).fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill(user.password);
      await page.getByLabel('Confirm password').fill(user.password);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page).toHaveURL(/\/check-email/);
    });

    await test.step('open the verification link from Mailpit', async () => {
      const link = await waitForVerifyLink(user.email);
      expect(new URL(link).origin).toBe(BASE);
      await page.goto(link);
      await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
    });

    await test.step('log in through the UI', async () => {
      await page
        .getByRole('link', { name: 'Log in' })
        .or(page.getByRole('button', { name: 'Log in' }))
        .first()
        .click();
      await expect(page).toHaveURL(/\/login/);
      await page.getByLabel('Email', { exact: true }).fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill(user.password);
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/\/dashboard\/favorites/);
      await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
      await expect(page.getByText('No saved titles yet')).toBeVisible();
    });

    await test.step('the session survives a reload (refresh cookie under Referrer-Policy: no-referrer)', async () => {
      const refresh = page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/auth/refresh') && r.request().method() === 'POST',
      );
      await page.reload();
      const res = await refresh;
      expect(res.status()).toBe(200);
      // The point of the policy: not even the same-origin Referer goes out, the one-time-token URLs stay private.
      expect(await res.request().headerValue('referer')).toBeNull();
      await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
      await expect(page).toHaveURL(/\/dashboard\/favorites/);
    });

    await test.step('open a title from Home: the server HTML already holds title and overview', async () => {
      const ssr = await request.get(TITLE_PATH);
      expect(ssr.status()).toBe(200);
      const html = await ssr.text();
      expect(html).toContain(`<title>${FIXTURE_MOVIE_TITLE} (2019) | Cinevault</title>`);
      // Without JavaScript the BODY already holds the title and the overview. Load the page in a
      // context with scripts off and read the rendered DOM: the head's description and the
      // transfer-state script also carry the overview, so a text match on the raw HTML proves nothing.
      const noJs = await browser.newContext({ javaScriptEnabled: false });
      try {
        const bare = await noJs.newPage();
        await bare.goto(`${BASE}${TITLE_PATH}`);
        await expect(bare.locator('body h1')).toHaveText(FIXTURE_MOVIE_TITLE);
        await expect(bare.locator('body')).toContainText(FIXTURE_MOVIE_OVERVIEW);
      } finally {
        await noJs.close();
      }

      await page.goto('/');
      // PRD section 7: the TMDB attribution is on every public page.
      await expect(
        page.getByText('This product uses the TMDB API but is not endorsed or certified by TMDB.'),
      ).toBeVisible();
      await page
        .getByRole('link', { name: new RegExp(FIXTURE_MOVIE_TITLE) })
        .first()
        .click();
      await expect(page).toHaveURL(new RegExp(`${TITLE_PATH}$`));
      await expect(
        page.getByRole('heading', { level: 1, name: FIXTURE_MOVIE_TITLE }),
      ).toBeVisible();
      await expect(page.getByText(FIXTURE_MOVIE_OVERVIEW).first()).toBeVisible();
    });

    await test.step('add it to My List', async () => {
      await page.getByRole('button', { name: 'Add to My List' }).click();
      await expect(page.getByRole('button', { name: 'In My List' })).toBeVisible();
    });

    await test.step('it is on Dashboard / Favorites', async () => {
      await page.goto('/dashboard/favorites');
      await expect(page.getByText('1 saved title', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: new RegExp(FIXTURE_MOVIE_TITLE) })).toBeVisible();
    });

    await test.step('log out through the UI', async () => {
      // Wait for the logout call: a reload in flight would cancel it and leave the session alive.
      const loggedOut = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/logout'));
      await page.getByRole('button', { name: 'Log out' }).click();
      expect((await loggedOut).status()).toBe(204);
      await page.goto('/dashboard/favorites');
      await expect(page).toHaveURL(/\/login/);
    });
  });
});

let userContext: BrowserContext | undefined;

test.describe('admin blocks the user', () => {
  // A step that throws must not leave the second browser context open.
  test.afterEach(async () => {
    await userContext?.close().catch(() => undefined);
  });

  test('the blocked user is rejected on the very next API call and cannot log in again', async ({
    browser,
    page,
    request,
  }) => {
    // 1. The user logs in BEFORE the block, in a second browser context: UI session plus an access token.
    userContext = await browser.newContext({ baseURL: BASE });
    await stubExternal(userContext);
    const userPage = await userContext.newPage();
    await logIn(userPage, user.email, user.password);
    await expect(userPage).toHaveURL(/\/dashboard\/favorites/);
    await expect(userPage.getByText('1 saved title', { exact: true })).toBeVisible();

    const login = await apiLogin(userContext.request, user.email, user.password);
    expect(login.status()).toBe(200);
    const { accessToken } = await login.json();
    const mine = { authorization: `Bearer ${accessToken}` };
    const before = await userContext.request.get('/api/v1/me/favorites/ids', { headers: mine });
    expect(before.status()).toBe(200);

    // 2. The seeded admin finds the user in Admin / Users and blocks it through the UI.
    await logIn(page, admin().email, admin().password);
    await expect(page).toHaveURL(/\/dashboard\/favorites/);
    await page.goto('/admin/users');
    await page.getByLabel('Search users by name or email').fill(user.email);
    const row = page.getByRole('row').filter({ hasText: user.email });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: `Block ${user.name}` }).click();
    await expect(page.getByText(`${user.name} is blocked and signed out.`)).toBeVisible();
    await expect(row.getByText('Blocked')).toBeVisible();

    // 3. The next call with the same, still unexpired (10 minute) access token is refused at once: the
    //    block marker is checked on every request, nothing waits for the token to run out.
    const after = await userContext.request.get('/api/v1/me/favorites/ids', { headers: mine });
    expect(after.status()).toBe(403);
    expect((await after.json()).code).toBe('ACCOUNT_BLOCKED');

    // 4. Its refresh token is revoked too: the open UI session cannot restore itself and is sent to /login.
    await userPage.reload();
    await expect(userPage).toHaveURL(/\/login/);

    // 5. A fresh login attempt gets ACCOUNT_BLOCKED, in the API and on the login page.
    const again = await apiLogin(userContext.request, user.email, user.password);
    expect(again.status()).toBe(403);
    expect((await again.json()).code).toBe('ACCOUNT_BLOCKED');
    await userPage.getByLabel('Email', { exact: true }).fill(user.email);
    await userPage.getByLabel('Password', { exact: true }).fill(user.password);
    await userPage.getByRole('button', { name: 'Log in' }).click();
    await expect(userPage.getByText('This account has been blocked.')).toBeVisible();
    await userContext.close();

    // 6. Clean up through the admin UI delete flow (the popup asks first).
    await row.getByRole('button', { name: `Delete ${user.name}` }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(user.email)).toHaveCount(0);

    // 7. The user is really gone: a login now is the generic wrong-credentials answer.
    const gone = await apiLogin(request, user.email, user.password);
    expect(gone.status()).toBe(401);
    expect((await gone.json()).code).toBe('INVALID_CREDENTIALS');
  });
});

test.describe('public pages and headers', () => {
  test('an unknown title is a real 404 with the Not found page', async ({ page }) => {
    const res = await page.goto(`/title/movie/${NOT_FOUND_ID}`);
    expect(res?.status()).toBe(404);
    expect(res?.headers()['cache-control']).toContain('no-store');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('TMDB failing for the title answers 503 with Retry-After and an error block with Retry', async ({
    page,
  }) => {
    const res = await page.goto(`/title/movie/${FAILING_ID}`);
    expect(res?.status()).toBe(503);
    expect(res?.headers()['retry-after']).toBe('30');
    expect(res?.headers()['cache-control']).toContain('no-store');
    await expect(page.getByText('Could not load this title.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('the nav search box is in the server HTML, hydrates on first use and finds a title', async ({
    page,
    request,
  }) => {
    // Angular Forms is loaded and hydrated lazily (a deferred block): the server must still render the box.
    const html = await (await request.get('/')).text();
    expect(html).toContain('role="search"');
    expect(html).toContain('placeholder="Search movies and shows"');

    const problems: string[] = [];
    page.on('console', (m) => {
      if (/NG\d{4}/.test(m.text())) problems.push(m.text());
    });
    page.on('pageerror', (e) => problems.push(e.message));

    await gotoBooted(page, '/');
    const box = page.getByRole('searchbox', { name: 'Search movies and shows' });
    await box.click();
    await box.fill(FIXTURE_MOVIE_TITLE);
    await box.press('Enter');
    await expect(page).toHaveURL(
      new RegExp(`/search\\?q=${encodeURIComponent(FIXTURE_MOVIE_TITLE)}`),
    );
    await expect(
      page.getByRole('link', { name: new RegExp(FIXTURE_MOVIE_TITLE) }).first(),
    ).toBeVisible();
    // A hydration mismatch (NG0500...) or an uncaught error would surface here.
    expect(problems).toEqual([]);
  });

  test('on a phone the search toggle hydrates the box, focuses it and Escape returns to the toggle', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await gotoBooted(page, '/');
    const box = page.getByRole('searchbox', { name: 'Search movies and shows' });
    await expect(box).toBeHidden();
    const toggle = page.getByRole('button', { name: 'Search titles' });
    await toggle.click();
    await expect(box).toBeFocused();
    await box.press('Escape');
    await expect(box).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('responses carry Referrer-Policy: no-referrer; /login is no-store and a catalog page is cacheable', async ({
    request,
  }) => {
    const login = await request.get('/login');
    expect(login.status()).toBe(200);
    expect(login.headers()['referrer-policy']).toBe('no-referrer');
    expect(login.headers()['cache-control']).toBe('no-store');

    const title = await request.get(TITLE_PATH);
    expect(title.headers()['referrer-policy']).toBe('no-referrer');
    expect(title.headers()['cache-control']).toContain('s-maxage=300');
    // The TMDB image host is warmed up by the first byte (Lighthouse LCP).
    expect(await title.text()).toContain('<link rel="preconnect" href="https://image.tmdb.org">');
  });
});
