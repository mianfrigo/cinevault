import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ResponseStatus } from './response-status.service';

describe('ResponseStatus', () => {
  it('sets the status and no-store on the server response, keeping its other headers', () => {
    const init: ResponseInit = {
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/html' }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: RESPONSE_INIT, useValue: init }] });

    TestBed.inject(ResponseStatus).set(404);

    const headers = new Headers(init.headers);
    expect(init.status).toBe(404);
    expect(headers.get('Cache-Control')).toBe('no-store');
    expect(headers.get('Content-Type')).toBe('text/html');
  });

  it('does nothing without a server response (browser, tests)', () => {
    expect(() => TestBed.inject(ResponseStatus).set(503)).not.toThrow();
  });
});
