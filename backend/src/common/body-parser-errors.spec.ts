import type { NextFunction, Request, Response } from 'express';
import { AppException } from './app.exception';
import { parserErrorHandler } from './body-parser-errors';

const handle = (err: unknown) => {
  const next = jest.fn<void, [unknown]>();
  parserErrorHandler(err, {} as Request, {} as Response, next as NextFunction);
  return next.mock.calls[0][0];
};
const parserError = (status: number, type: string) =>
  Object.assign(new Error('raw parser text with SECRET'), {
    status,
    statusCode: status,
    expose: true,
    type,
  });

describe('parserErrorHandler', () => {
  it.each([
    [400, 'entity.parse.failed', 'VALIDATION_ERROR', 'Malformed request body'],
    [413, 'entity.too.large', 'ERROR', 'Payload too large'],
    [415, 'charset.unsupported', 'ERROR', 'Unsupported media type'],
    [403, 'entity.verify.failed', 'ERROR', 'Request could not be processed'],
  ])(
    'maps exposed parser error %i %s to a fixed AppException',
    (status, type, code, message) => {
      const out = handle(parserError(status, type)) as AppException;
      expect(out).toBeInstanceOf(AppException);
      expect(out.getStatus()).toBe(status);
      expect(out.code).toBe(code);
      expect(out.message).toBe(message);
    },
  );

  it('passes through anything that is not an exposed 4xx parser error', () => {
    const upstream = Object.assign(new Error('x'), { status: 401 });
    expect(handle(upstream)).toBe(upstream);
    const serverError = Object.assign(new Error('x'), {
      status: 500,
      expose: true,
    });
    expect(handle(serverError)).toBe(serverError);
    const fractional = parserError(400.5, 'entity.parse.failed');
    expect(handle(fractional)).toBe(fractional);
  });
});
