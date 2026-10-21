import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchHealth } from './health';

function mockFetch(body: unknown, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchHealth', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with the parsed body when the server reports ok', async () => {
    const fetchMock = mockFetch({ status: 'ok' });

    await expect(fetchHealth()).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith('/healthz');
  });

  it('rejects when the body does not match the shared schema', async () => {
    mockFetch({ status: 'down' });

    await expect(fetchHealth()).rejects.toThrow();
  });

  it('rejects when the body has extra keys', async () => {
    mockFetch({ status: 'ok', uptime: 1 });

    await expect(fetchHealth()).rejects.toThrow();
  });

  it('rejects when the response is not ok', async () => {
    mockFetch({ status: 'ok' }, { status: 503 });

    await expect(fetchHealth()).rejects.toThrow('503');
  });
});
