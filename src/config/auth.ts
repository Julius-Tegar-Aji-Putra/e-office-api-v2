/**
 * Auth Configuration
 * Konfigurasi autentikasi (JWT, secret, expiry)
 */

import { env } from './env';

export const authConfig = {
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    algorithm: 'HS256' as const,
  },
  
  oauth: {
    clientId: env.OAUTH_CLIENT_ID,
    clientSecret: env.OAUTH_CLIENT_SECRET,
    callbackUrl: env.OAUTH_CALLBACK_URL,
  },
  
  password: {
    saltRounds: 10,
    minLength: 8,
  },
} as const;
