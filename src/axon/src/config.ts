const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;

export function resolvePort(env: NodeJS.ProcessEnv): number {
  const raw = env.PORT;
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > MAX_PORT) {
    throw new Error(`Invalid PORT: expected an integer between 1 and ${MAX_PORT}`);
  }
  return port;
}

export interface LifetimeConfig {
  readonly emptyTtlMs: number;
  readonly maxAgeMs: number;
  readonly sweepIntervalMs: number;
}

export const DEFAULT_LIFETIME: LifetimeConfig = {
  emptyTtlMs: 2 * 60 * 1000,
  maxAgeMs: 2 * 60 * 60 * 1000,
  sweepIntervalMs: 30 * 1000,
};

function resolveDuration(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid ${name}: expected a positive integer number of milliseconds`);
  }
  return value;
}

export function resolveLifetime(env: NodeJS.ProcessEnv): LifetimeConfig {
  return {
    emptyTtlMs: resolveDuration(env, 'GAME_EMPTY_TTL_MS', DEFAULT_LIFETIME.emptyTtlMs),
    maxAgeMs: resolveDuration(env, 'GAME_MAX_AGE_MS', DEFAULT_LIFETIME.maxAgeMs),
    sweepIntervalMs: resolveDuration(env, 'SWEEP_INTERVAL_MS', DEFAULT_LIFETIME.sweepIntervalMs),
  };
}
