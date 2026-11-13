import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ResponseStatus } from './response-status.service';

describe('ResponseStatus', () => {
  function serverResponse(): ResponseInit {
    const init: ResponseInit = {
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/html' }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: RESPONSE_INIT, useValue: init }] });
    return init;
  }

  it('answers 404 with no-store, keeping the other headers', () => {
    const init = serverResponse();

    TestBed.inject(ResponseStatus).set(404);

    const headers = new Headers(init.headers);
    expect(init.status).toBe(404);
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('Retry-After')).toBeNull();
    expect(headers.get('Content-Type')).toBe('text/html');
  });

  it('answers 503 with no-store and Retry-After', () => {
    const init = serverResponse();

    TestBed.inject(ResponseStatus).set(503);

    const headers = new Headers(init.headers);
    expect(init.status).toBe(503);
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('Retry-After')).toBe('30');
  });

  it('keeps a 200 and only forbids caching for noStore()', () => {
    const init = serverResponse();

    TestBed.inject(ResponseStatus).noStore();

    const headers = new Headers(init.headers);
    expect(init.status).toBe(200);
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('Retry-After')).toBeNull();
    expect(headers.get('Content-Type')).toBe('text/html');
  });

  it('does nothing without a server response (browser, tests)', () => {
    const status = TestBed.inject(ResponseStatus);
    expect(() => {
      status.set(503);
      status.noStore();
    }).not.toThrow();
  });
});
