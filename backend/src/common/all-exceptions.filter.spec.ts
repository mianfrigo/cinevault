import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';

type Req = Record<string, unknown>;

function run(exception: unknown, req: Req = {}) {
  const json = jest.fn<void, [Record<string, unknown>]>();
  const status = jest.fn<{ json: typeof json }, [number]>(() => ({ json }));
  const res = { status };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return {
    status: status.mock.calls[0]?.[0],
    body: json.mock.calls[0]?.[0],
  };
}

describe('AllExceptionsFilter', () => {
  let logged: jest.SpyInstance;
  beforeEach(() => {
    logged = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('does not trust a statusCode on an arbitrary error: 500 and logged by name', () => {
    const upstream = Object.assign(new Error('token=SECRET'), {
      statusCode: 401,
    });
    const { status, body } = run(upstream);
    expect(status).toBe(500);
    expect(body).toEqual({
      statusCode: 500,
      code: 'ERROR',
      message: 'Internal server error',
    });
    expect(logged).toHaveBeenCalledWith('Error');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('SECRET');
  });

  it('maps an exposed body-parser error (413) to a fixed message', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
      type: 'entity.too.large',
    });
    expect(run(tooLarge)).toEqual({
      status: 413,
      body: { statusCode: 413, code: 'ERROR', message: 'Payload too large' },
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it('gives a JSON body Nest wrapped after a parse failure the fixed message', () => {
    const req = {
      headers: { 'content-length': '5' },
      is: () => 'json',
      body: undefined,
    };
    const wrapped = new BadRequestException('Unexpected token SECRET in JSON');
    expect(run(wrapped, req)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Malformed request body',
      },
    });
  });

  it('keeps the reason of any other 400 and uses VALIDATION_ERROR', () => {
    const req = {
      headers: { 'content-length': '5' },
      is: () => 'json',
      body: { ok: true },
    };
    expect(run(new BadRequestException('bad reason'), req).body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'bad reason',
    });
    expect(run(new BadRequestException(['a', 'b']), {}).body).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'a; b',
    });
  });

  it('keeps AppException codes and other HttpException statuses', () => {
    expect(run(new AppException(409, 'CONFLICT_PROBE', 'nope')).body).toEqual({
      statusCode: 409,
      code: 'CONFLICT_PROBE',
      message: 'nope',
    });
    expect(run(new NotFoundException('gone')).body).toMatchObject({
      statusCode: 404,
      code: 'ERROR',
      message: 'gone',
    });
  });
});
