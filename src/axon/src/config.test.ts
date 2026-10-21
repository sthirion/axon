import { describe, expect, it } from 'vitest';
import { resolvePort } from './config.js';

describe('resolvePort', () => {
  it('defaults to 3000 when PORT is unset', () => {
    expect(resolvePort({})).toBe(3000);
  });

  it('defaults to 3000 when PORT is empty', () => {
    expect(resolvePort({ PORT: '' })).toBe(3000);
  });

  it('uses PORT when it is valid', () => {
    expect(resolvePort({ PORT: '4000' })).toBe(4000);
  });

  it.each(['1', '65535'])('accepts the boundary port %s', (port) => {
    expect(resolvePort({ PORT: port })).toBe(Number(port));
  });

  it.each(['abc', '0', '70000', '65536', '-1', '30.5', '3000x'])(
    'throws on invalid PORT %s',
    (port) => {
      expect(() => resolvePort({ PORT: port })).toThrow('Invalid PORT');
    },
  );
});
