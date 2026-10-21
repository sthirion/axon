import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@axon/shared';

describe('healthResponseSchema', () => {
  it('accepts status ok', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
  });

  it('rejects status down', () => {
    expect(healthResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
  });

  it('rejects an empty object', () => {
    expect(healthResponseSchema.safeParse({}).success).toBe(false);
  });

  it('rejects extra keys', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', uptime: 1 }).success).toBe(false);
  });
});
