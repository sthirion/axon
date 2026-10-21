import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('zodConfig', () => {
  it('enables Zod jitless mode so no eval probe violates the CSP', async () => {
    await import('./zodConfig');

    expect(z.config().jitless).toBe(true);
  });
});
