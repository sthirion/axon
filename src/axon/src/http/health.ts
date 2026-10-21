import type { Request, Response } from 'express';
import { healthResponseSchema } from '@axon/shared';

export function healthHandler(_req: Request, res: Response): void {
  const body = healthResponseSchema.parse({ status: 'ok' });
  res.set('Cache-Control', 'no-store').status(200).json(body);
}
