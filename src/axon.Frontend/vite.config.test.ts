// @vitest-environment node
// The config imports vite (esbuild), which breaks under jsdom's TextEncoder.
import { describe, expect, it } from 'vitest';
import config from './vite.config';

describe('vite config', () => {
  const server = config.server;

  it('binds the dev server to 127.0.0.1:5173 and fails when the port is taken', () => {
    expect(server?.host).toBe('127.0.0.1');
    expect(server?.port).toBe(5173);
    expect(server?.strictPort).toBe(true);
  });

  it('proxies exactly /api, /healthz and /socket.io to the server', () => {
    expect(Object.keys(server?.proxy ?? {}).sort()).toEqual(['/api', '/healthz', '/socket.io']);
  });

  it('targets the server on 127.0.0.1:3000', () => {
    expect(server?.proxy).toMatchObject({
      '/api': { target: 'http://127.0.0.1:3000' },
      '/healthz': { target: 'http://127.0.0.1:3000' },
      '/socket.io': { target: 'http://127.0.0.1:3000' },
    });
  });

  it('proxies websockets only on /socket.io', () => {
    const proxy = server?.proxy as Record<string, { ws?: boolean }>;

    expect(proxy['/socket.io']?.ws).toBe(true);
    expect(proxy['/api']?.ws).toBeUndefined();
    expect(proxy['/healthz']?.ws).toBeUndefined();
  });

  it('resolves @axon/shared from source', () => {
    expect(config.resolve?.conditions).toContain('source');
  });
});
