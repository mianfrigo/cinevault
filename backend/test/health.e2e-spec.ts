import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('Health and error shape (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /api/v1/health returns ok', () =>
    request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok' }));

  it('unknown route returns the standard error body', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/nope')
      .expect(404);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['code', 'message', 'statusCode']);
    expect(body.statusCode).toBe(404);
  });

  it('CORS allows WEB_ORIGIN with credentials', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', process.env.WEB_ORIGIN as string);
    expect(res.headers['access-control-allow-origin']).toBe(
      process.env.WEB_ORIGIN,
    );
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
