import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@axon/shared';
import { healthHandler } from './health.js';
import { createFakeRequest, createFakeResponse } from './testing/fakes.js';

describe('healthHandler', () => {
  it('responds 200 with a body valid for the shared schema', () => {
    const fake = createFakeResponse();

    healthHandler(createFakeRequest('GET', '/healthz'), fake.res);

    expect(fake.statusCode).toBe(200);
    expect(healthResponseSchema.parse(fake.body)).toEqual({ status: 'ok' });
  });

  it('exposes nothing beyond the status', () => {
    const fake = createFakeResponse();

    healthHandler(createFakeRequest('GET', '/healthz'), fake.res);

    expect(Object.keys(fake.body as object)).toEqual(['status']);
  });

  it('disables caching', () => {
    const fake = createFakeResponse();

    healthHandler(createFakeRequest('GET', '/healthz'), fake.res);

    expect(fake.headers['Cache-Control']).toBe('no-store');
  });
});
