import { loadEnv } from './env';

const required = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  TMDB_READ_TOKEN: 'token',
  JWT_ACCESS_SECRET: 'secret',
  WEB_ORIGIN: 'http://localhost:4200',
};

describe('loadEnv', () => {
  it('throws listing every missing required variable', () => {
    let message = '';
    try {
      loadEnv({});
    } catch (e) {
      message = (e as Error).message;
    }
    for (const name of [
      'DATABASE_URL',
      'REDIS_URL',
      'TMDB_READ_TOKEN',
      'JWT_ACCESS_SECRET',
      'WEB_ORIGIN',
    ]) {
      expect(message).toContain(name);
    }
  });

  it('applies defaults', () => {
    const env = loadEnv(required);
    expect(env.featureDownloadButton).toBe(false);
    expect(env.throttleDisabled).toBe(false);
    expect(env.trustProxy).toBe(false);
    expect(env.tmdbBaseUrl).toBe('https://api.themoviedb.org/3');
    expect(env.port).toBe(3000);
    expect(env.smtpUrl).toBe('smtp://localhost:1025');
    expect(env.cookieSecure).toBe(false);
  });

  it('parses FEATURE_DOWNLOAD_BUTTON=true', () => {
    expect(
      loadEnv({ ...required, FEATURE_DOWNLOAD_BUTTON: 'true' })
        .featureDownloadButton,
    ).toBe(true);
  });

  it('defaults COOKIE_SECURE to true in production', () => {
    const env = loadEnv({
      ...required,
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'x'.repeat(32),
    });
    expect(env.cookieSecure).toBe(true);
  });

  it('reports invalid values', () => {
    expect(() =>
      loadEnv({ ...required, PORT: 'abc', FEATURE_DOWNLOAD_BUTTON: 'yes' }),
    ).toThrow(/PORT[\s\S]*FEATURE_DOWNLOAD_BUTTON/);
  });

  describe('JWT_ACCESS_SECRET length', () => {
    const short = 'short-secret';
    it('rejects a short secret in production without echoing it', () => {
      let message = '';
      try {
        loadEnv({
          ...required,
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: short,
        });
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain('JWT_ACCESS_SECRET');
      expect(message).not.toContain(short);
    });

    it('rejects a short secret in any non-test, non-development environment', () => {
      expect(() =>
        loadEnv({ ...required, NODE_ENV: 'staging', JWT_ACCESS_SECRET: short }),
      ).toThrow(/JWT_ACCESS_SECRET must be at least 32/);
    });

    it('accepts 32 characters in production', () => {
      expect(() =>
        loadEnv({
          ...required,
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'x'.repeat(32),
        }),
      ).not.toThrow();
    });

    it('accepts a short secret in test and development', () => {
      for (const NODE_ENV of ['test', 'development']) {
        expect(() =>
          loadEnv({ ...required, NODE_ENV, JWT_ACCESS_SECRET: short }),
        ).not.toThrow();
      }
    });
  });
});
