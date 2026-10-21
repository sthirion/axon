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
