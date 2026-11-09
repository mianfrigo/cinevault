import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env';
import { TokensService } from './tokens.service';

const SECRET = 'unit-test-secret-unit-test-secret-00';
const env = { jwtAccessSecret: SECRET } as Env;
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('TokensService', () => {
  const jwt = new JwtService();
  const tokens = new TokensService(jwt, env);

  it('generateOpaque returns a token whose hashOpaque equals hash', () => {
    const { token, hash } = tokens.generateOpaque();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes, base64url
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
    expect(tokens.hashOpaque(token)).toBe(hash);
    expect(tokens.generateOpaque().token).not.toBe(token);
  });

  it('signAccess then verifyAccess round-trips sub and role', async () => {
    const jwtStr = await tokens.signAccess({ id: 'u-1', role: 'ADMIN' });
    const payload = await tokens.verifyAccess(jwtStr);
    expect(payload).toEqual({ sub: 'u-1', role: 'ADMIN' });
    const { iat, exp } = jwt.decode<{ iat: number; exp: number }>(jwtStr);
    expect(exp - iat).toBe(600); // 10 minutes
  });

  it('verifyAccess rejects a token signed with another secret', async () => {
    const forged = await jwt.signAsync(
      { sub: 'u-1', role: 'ADMIN' },
      { secret: 'another-secret-another-secret-00000', expiresIn: '10m' },
    );
    await expect(tokens.verifyAccess(forged)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('verifyAccess rejects an expired token', async () => {
    const expired = await jwt.signAsync(
      { sub: 'u-1', role: 'USER' },
      { secret: SECRET, expiresIn: -10 },
    );
    await expect(tokens.verifyAccess(expired)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('verifyAccess rejects alg=none and a different HMAC algorithm', async () => {
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: 'u-1',
      role: 'ADMIN',
      exp: Math.floor(Date.now() / 1000) + 600,
    })}.`;
    await expect(tokens.verifyAccess(none)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    const hs512 = await jwt.signAsync(
      { sub: 'u-1', role: 'ADMIN' },
      { secret: SECRET, algorithm: 'HS512', expiresIn: '10m' },
    );
    await expect(tokens.verifyAccess(hs512)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('verifyAccess rejects garbage', async () => {
    await expect(tokens.verifyAccess('not.a.jwt')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});
