/**
 * Role Middleware
 * Middleware otorisasi berbasis role
 */

import { Context, Next } from 'hono';
import { ROLES } from '../constants/roles';

export const roleMiddleware = (...allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'User tidak terautentikasi' }, 401);
    }
    
    if (!allowedRoles.includes(user.role)) {
      return c.json({ 
        error: 'Forbidden', 
        message: 'Anda tidak memiliki akses ke resource ini' 
      }, 403);
    }
    
    await next();
  };
};
