/**
 * Auth Configuration
 * Konfigurasi autentikasi (JWT, secret, expiry)
 */

import { env } from './env';

export const authConfig = {
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: '7d', // Default 7 days, was previously referencing non-existent env.JWT_EXPIRES_IN
    algorithm: 'HS256' as const,
  },

  oauth: {
    clientId: env.SSO_URL || '', // OAuth config moved to SSO_URL in env schema
    clientSecret: '',
    callbackUrl: '',
  },

  password: {
    saltRounds: 10,
    minLength: 8,
  },
} as const;
