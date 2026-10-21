import type { ErrorRequestHandler, RequestHandler } from 'express';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Not found' });
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const name = err instanceof Error ? err.name : typeof err;
  console.error(JSON.stringify({ level: 'error', event: 'http.unhandled_error', name }));
  res.status(500).json({ code: 'INTERNAL', message: 'Internal server error' });
};
