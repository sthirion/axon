import helmet from 'helmet';

const directives = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'connect-src': ["'self'"],
  'font-src': ["'self'", 'data:'],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
  'img-src': ["'self'", 'data:'],
  'object-src': ["'none'"],
  'script-src': ["'self'"],
  'script-src-attr': ["'none'"],
  'style-src': ["'self'", "'unsafe-inline'"],
};

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: { useDefaults: false, directives },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  });
}
