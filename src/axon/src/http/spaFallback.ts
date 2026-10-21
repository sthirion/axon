import path from 'node:path';
import type { RequestHandler } from 'express';

const RESERVED_PREFIX = /^\/(api|socket\.io)(\/|$)/;

export function spaFallback(indexFile: string): RequestHandler {
  return (req, res, next) => {
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    if (!isRead || RESERVED_PREFIX.test(req.path) || path.extname(req.path) !== '') {
      next();
      return;
    }
    res.sendFile(indexFile, (err) => {
      if (err) next(err);
    });
  };
}
