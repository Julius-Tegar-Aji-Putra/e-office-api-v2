/**
 * Error Middleware
 * Global error handler (centralized error)
 */

import { Context } from 'hono';
import { env } from '../../config/env';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorMiddleware = (err: Error, c: Context) => {
  console.error('Error:', err);
  
  if (err instanceof AppError) {
    return c.json({
      error: err.message,
      statusCode: err.statusCode,
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    }, err.statusCode as any);
  }
  
  // Unhandled errors
  return c.json({
    error: 'Internal Server Error',
    message: env.NODE_ENV === 'development' ? err.message : 'Terjadi kesalahan pada server',
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  }, 500);
};
