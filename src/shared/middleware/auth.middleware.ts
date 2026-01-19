/**
 * Auth Middleware
 * Middleware autentikasi (JWT verification)
 */

import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { authConfig } from '../../config/auth';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized', message: 'Token tidak ditemukan' }, 401);
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, authConfig.jwt.secret) as JWTPayload;
    
    // Attach user to context
    c.set('user', decoded);
    
    await next();
  } catch (error) {
    return c.json({ error: 'Unauthorized', message: 'Token tidak valid atau expired' }, 401);
  }
};
