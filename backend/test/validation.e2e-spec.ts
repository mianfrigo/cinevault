import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
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

  @Post('reject')
  reject(@Body() body: unknown): never {
    void body;
    throw new BadRequestException('probe reason');
  }

  @Get('int/:n')
  int(@Param('n', ParseIntPipe) n: number) {
    return { n };
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
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
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
    // The detail of what is wrong is kept.
    expect((res.body as { message: string }).message).toContain(
      'name must be a string',
    );
  });

  it('a controller BadRequestException on a JSON POST keeps its own reason', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe/reject')
      .send({ anything: 'goes' })
      .expect(400);
    expect(res.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'probe reason',
    });
  });

  it('a ParseIntPipe failure keeps the pipe message with VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/int/abc')
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect((res.body as { message: string }).message).toContain(
      'numeric string is expected',
    );
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
      message: 'Malformed request body',
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

  it('parser error responses carry CORS headers for WEB_ORIGIN', async () => {
    const origin = process.env.WEB_ORIGIN as string;
    const expectCors = (res: { headers: Record<string, string> }) => {
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    };
    expectCors(
      await request(app.getHttpServer())
        .post('/api/v1/probe')
        .set('Origin', origin)
        .set('Content-Type', 'application/json')
        .send('{"name":')
        .expect(400),
    );
    expectCors(
      await request(app.getHttpServer())
        .post('/api/v1/probe')
        .set('Origin', origin)
        .send({ name: 'x'.repeat(200_000) })
        .expect(413),
    );
  });

  it('a CORS preflight is still answered before the body parsers', async () => {
    const origin = process.env.WEB_ORIGIN as string;
    const res = await request(app.getHttpServer())
      .options('/api/v1/probe')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('an unsupported charset gives 415 ERROR with a fixed message', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .set('Content-Type', 'application/json; charset=nope')
      .send('{"name":"x"}')
      .expect(415);
    expect(res.body).toEqual({
      statusCode: 415,
      code: 'ERROR',
      message: 'Unsupported media type',
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
