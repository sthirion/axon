import { describe, expect, it, vi } from 'vitest';
import { spaFallback } from './spaFallback.js';
import { createFakeRequest, createFakeResponse } from './testing/fakes.js';

const indexFile = '/static/index.html';

describe('spaFallback', () => {
  it.each([
    ['GET', '/'],
    ['GET', '/g/abc123'],
    ['HEAD', '/g/abc123'],
  ])('serves index.html for %s %s', (method, path) => {
    const fake = createFakeResponse();
    const next = vi.fn();

    spaFallback(indexFile)(createFakeRequest(method, path), fake.res, next);

    expect(fake.sentFile).toBe(indexFile);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', '/'],
    ['PUT', '/g/abc123'],
    ['GET', '/api'],
    ['GET', '/api/does-not-exist'],
    ['GET', '/socket.io/'],
    ['GET', '/assets/missing.js'],
  ])('skips %s %s', (method, path) => {
    const fake = createFakeResponse();
    const next = vi.fn();

    spaFallback(indexFile)(createFakeRequest(method, path), fake.res, next);

    expect(fake.sentFile).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it('serves index.html for a path that only starts like a reserved prefix', () => {
    const fake = createFakeResponse();

    spaFallback(indexFile)(createFakeRequest('GET', '/apiary'), fake.res, vi.fn());

    expect(fake.sentFile).toBe(indexFile);
  });

  it('passes a sendFile failure to the error handler', () => {
    const failure = new Error('ENOENT');
    const fake = createFakeResponse({}, failure);
    const next = vi.fn();

    spaFallback(indexFile)(createFakeRequest('GET', '/g/abc123'), fake.res, next);

    expect(next).toHaveBeenCalledWith(failure);
  });
});
