import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    const hidden = false;
    expect(cn('a', hidden && 'b', undefined, 'c')).toBe('a c');
  });

  it('lets the later conflicting Tailwind class win', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
