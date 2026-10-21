import { healthResponseSchema, type HealthResponse } from '@axon/shared';

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/healthz');
  if (!response.ok) throw new Error(`Health check failed with status ${response.status}`);
  return healthResponseSchema.parse(await response.json());
}
