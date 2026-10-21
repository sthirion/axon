import { z } from 'zod';

// Zod's JIT probes `new Function`, which the strict `script-src 'self'` CSP reports as a violation.
z.config({ jitless: true });
