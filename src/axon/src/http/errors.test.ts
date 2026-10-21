import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, notFoundHandler } from './errors.js';
import { createFakeRequest, createFakeResponse } from './testing/fakes.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('notFoundHandler', () => {
  it('responds 404 with the NOT_FOUND JSON body', () => {
    const fake = createFakeResponse();

    notFoundHandler(createFakeRequest('POST', '/healthz'), fake.res, vi.fn());

    expect(fake.statusCode).toBe(404);
    expect(fake.body).toEqual({ code: 'NOT_FOUND', message: 'Not found' });
  });
});

describe('errorHandler', () => {
  it('responds 500 with a generic body that carries no error details', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeResponse();

    errorHandler(
      new Error('secret /var/app/db.ts'),
      createFakeRequest('GET', '/x'),
      fake.res,
      vi.fn(),
    );

    expect(fake.statusCode).toBe(500);
    expect(fake.body).toEqual({ code: 'INTERNAL', message: 'Internal server error' });
    expect(JSON.stringify(fake.body)).not.toMatch(/secret|stack|\.ts/);
  });

  it('keeps headers already set on the response', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeResponse({ 'Content-Security-Policy': "default-src 'self'" });

    errorHandler(new Error('boom'), createFakeRequest('GET', '/x'), fake.res, vi.fn());

    expect(fake.headers['Content-Security-Policy']).toBe("default-src 'self'");
  });

  it('logs the error name but not its message', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeResponse();

    errorHandler(new TypeError('token=abc'), createFakeRequest('GET', '/x'), fake.res, vi.fn());

    const logged = String(log.mock.calls[0]?.[0]);
    expect(logged).toContain('TypeError');
    expect(logged).not.toContain('token=abc');
  });

  it('logs the type of a non-Error value', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createFakeResponse();

    errorHandler('oops', createFakeRequest('GET', '/x'), fake.res, vi.fn());

    expect(String(log.mock.calls[0]?.[0])).toContain('string');
    expect(fake.statusCode).toBe(500);
  });

  it('delegates to the next handler once the response has started', () => {
    const fake = createFakeResponse();
    fake.res.json({});
    const next = vi.fn();
    const error = new Error('late');

    errorHandler(error, createFakeRequest('GET', '/x'), fake.res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(fake.statusCode).toBeUndefined();
  });
});
