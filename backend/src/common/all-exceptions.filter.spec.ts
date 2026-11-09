import {
  ArgumentsHost,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';

function run(exception: unknown) {
  const json = jest.fn<void, [Record<string, unknown>]>();
  const status = jest.fn<{ json: typeof json }, [number]>(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return { status: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
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
      status: 401,
      expose: true,
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

  it('keeps the reason of a plain 400 and uses VALIDATION_ERROR', () => {
    expect(run(new BadRequestException('bad reason')).body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'bad reason',
    });
    expect(run(new BadRequestException(['a', 'b'])).body).toMatchObject({
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
