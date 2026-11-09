import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppException } from '../src/common/app.exception';

class EchoDto {
  @IsString()
  name!: string;
}

@Controller('probe')
class ProbeController {
  @Post()
  echo(@Body() dto: EchoDto) {
    return dto;
  }

  @Get('app')
  app(): never {
    throw new AppException(409, 'CONFLICT_PROBE', 'nope');
  }

  @Get('boom')
  boom(): never {
    throw new Error('secret detail');
  }
}

describe('Global pipe and filter (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('invalid body gives 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .send({ name: 1, extra: true })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('malformed JSON gives 400 VALIDATION_ERROR without echoing the parser message', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .set('Content-Type', 'application/json')
      .send('{"name": "SECRET-TOKEN"')
      .expect(400);
    expect(res.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Malformed request',
    });
  });

  it('oversized body gives 413 ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .send({ name: 'x'.repeat(200_000) })
      .expect(413);
    expect(res.body).toEqual({
      statusCode: 413,
      code: 'ERROR',
      message: 'Payload too large',
    });
  });

  it('AppException keeps its code', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/app')
      .expect(409);
    expect(res.body).toEqual({
      statusCode: 409,
      code: 'CONFLICT_PROBE',
      message: 'nope',
    });
  });

  it('unexpected errors give 500 ERROR without leaking the message', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/boom')
      .expect(500);
    expect(res.body).toEqual({
      statusCode: 500,
      code: 'ERROR',
      message: 'Internal server error',
    });
  });
});
