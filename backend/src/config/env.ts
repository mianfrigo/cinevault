export interface Env {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  redisUrl: string;
  tmdbReadToken: string;
  tmdbBaseUrl: string;
  jwtAccessSecret: string;
  webOrigin: string;
  cookieSecure: boolean;
  mailFrom: string;
  smtpUrl: string;
  featureDownloadButton: boolean;
  throttleDisabled: boolean;
  trustProxy: boolean;
}

export const ENV = Symbol('ENV');

type Raw = Record<string, string | undefined>;

/** Parses and validates the environment; throws one Error listing every problem. */
export function loadEnv(raw: Raw): Env {
  const problems: string[] = [];
  const blank = (v?: string) => v === undefined || v.trim() === '';

  const str = (name: string, fallback?: string): string => {
    const v = raw[name];
    if (!blank(v)) return v!.trim();
    if (fallback === undefined) problems.push(`${name} is required`);
    return fallback ?? '';
  };
  const bool = (name: string, fallback: boolean): boolean => {
    const v = raw[name]?.trim();
    if (blank(v)) return fallback;
    if (v === 'true' || v === 'false') return v === 'true';
    problems.push(`${name} must be "true" or "false"`);
    return fallback;
  };
  const url = (name: string, fallback?: string): string => {
    const v = str(name, fallback);
    if (v && !URL.canParse(v)) problems.push(`${name} must be a valid URL`);
    return v;
  };

  const nodeEnv = str('NODE_ENV', 'development') as Env['nodeEnv'];
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    problems.push('NODE_ENV must be development, test or production');
  }

  let port = 3000;
  if (!blank(raw.PORT)) {
    port = Number(raw.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      problems.push('PORT must be an integer between 1 and 65535');
    }
  }

  const jwtAccessSecret = str('JWT_ACCESS_SECRET');
  if (
    nodeEnv !== 'test' &&
    nodeEnv !== 'development' &&
    jwtAccessSecret &&
    jwtAccessSecret.length < 32
  ) {
    problems.push(
      'JWT_ACCESS_SECRET must be at least 32 characters outside test and development',
    );
  }

  const env: Env = {
    nodeEnv,
    port,
    databaseUrl: str('DATABASE_URL'),
    redisUrl: str('REDIS_URL'),
    tmdbReadToken: str('TMDB_READ_TOKEN'),
    tmdbBaseUrl: url('TMDB_BASE_URL', 'https://api.themoviedb.org/3').replace(
      /\/+$/,
      '',
    ),
    jwtAccessSecret,
    webOrigin: url('WEB_ORIGIN').replace(/\/+$/, ''),
    cookieSecure: bool('COOKIE_SECURE', nodeEnv === 'production'),
    mailFrom: str('MAIL_FROM', 'Cinevault <no-reply@cinevault.local>'),
    smtpUrl: url('SMTP_URL', 'smtp://localhost:1025'),
    featureDownloadButton: bool('FEATURE_DOWNLOAD_BUTTON', false),
    throttleDisabled: bool('THROTTLE_DISABLED', false),
    trustProxy: bool('TRUST_PROXY', false),
  };

  if (problems.length) {
    throw new Error(`Invalid environment:\n- ${problems.join('\n- ')}`);
  }
  return env;
}
