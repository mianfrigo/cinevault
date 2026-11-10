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

  describe('TRUST_PROXY', () => {
    const trust = (TRUST_PROXY?: string) =>
      loadEnv({ ...required, TRUST_PROXY }).trustProxy;
    it('parses false, true and hop counts', () => {
      expect(trust()).toBe(false);
      expect(trust('false')).toBe(false);
      expect(trust('true')).toBe(true);
      expect(trust('1')).toBe(1);
      expect(trust(' 2 ')).toBe(2);
      expect(trust('0')).toBe(0);
      expect(trust('10')).toBe(10);
    });
    it.each(['-1', '11', '1.5', '1e1', 'yes', '0x1', '192.168.0.1'])(
      'rejects %s naming the variable and not the value',
      (value) => {
        let message = '';
        try {
          trust(value);
        } catch (e) {
          message = (e as Error).message;
        }
        expect(message).toContain('TRUST_PROXY');
        expect(message).not.toContain(value);
      },
    );
  });

  describe('THROTTLE_DISABLED', () => {
    it('is rejected in production, naming the variable', () => {
      expect(() =>
        loadEnv({
          ...required,
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'x'.repeat(32),
          THROTTLE_DISABLED: 'true',
        }),
      ).toThrow(/THROTTLE_DISABLED/);
    });
    it('is allowed in test and development', () => {
      for (const NODE_ENV of ['test', 'development']) {
        expect(
          loadEnv({ ...required, NODE_ENV, THROTTLE_DISABLED: 'true' })
            .throttleDisabled,
        ).toBe(true);
      }
    });
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
