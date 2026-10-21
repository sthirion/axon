import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { securityHeaders } from './securityHeaders.js';

const EXPECTED_CSP =
  "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; " +
  "form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; " +
  "script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'";

function runMiddleware(): Map<string, string> {
  const headers = new Map<string, string>();
  const res = {
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), String(value)),
    removeHeader: (name: string) => headers.delete(name.toLowerCase()),
    getHeader: (name: string) => headers.get(name.toLowerCase()),
  };
  const next = vi.fn() as unknown as NextFunction;
  securityHeaders()({} as Request, res as unknown as Response, next);
  expect(next).toHaveBeenCalledOnce();
  return headers;
}

describe('securityHeaders', () => {
  it('sets the exact content security policy', () => {
    const csp = runMiddleware().get('content-security-policy');

    // helmet joins directives with ";" and no space; compare the directives, not the whitespace.
    expect(csp?.split(';').join('; ')).toBe(EXPECTED_CSP);
  });

  it('denies framing and disables referrers and sniffing', () => {
    const headers = runMiddleware();

    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets transport and cross-origin isolation headers', () => {
    const headers = runMiddleware();

    expect(headers.get('strict-transport-security')).toMatch(/^max-age=\d+/);
    expect(headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });
});
