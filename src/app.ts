/**
 * Application Setup
 * Inisialisasi aplikasi (Hono), registrasi middleware global & routes
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { env } from './config/env';
import { registerRoutes } from './routes';
import { errorMiddleware } from './shared/middleware/error.middleware';
import './types'; // Import global type declarations

// Create Hono app instance
const app = new Hono();

// ============================================
// GLOBAL MIDDLEWARE
// ============================================

// Request logging (development only)
if (env.NODE_ENV === 'development') {
  app.use('*', logger());
  app.use('*', prettyJSON());
}

// CORS configuration
app.use(
  '*',
  cors({
    origin: ['http://localhost:3001', 'http://localhost:3000'], // Add your frontend URLs
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Custom context middleware (untuk attach user info, dll)
app.use('*', async (c, next) => {
  // Add request ID for tracing
  c.set('requestId', crypto.randomUUID());
  c.set('requestTime', Date.now());
  
  await next();
  
  // Log response time
  const responseTime = Date.now() - c.get('requestTime');
  c.header('X-Response-Time', `${responseTime}ms`);
});

// ============================================
// ROUTE REGISTRATION
// ============================================
registerRoutes(app);

// ============================================
// 404 HANDLER
// ============================================
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: 'The requested resource was not found',
      path: c.req.path,
    },
    404
  );
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
app.onError((err, c) => {
  return errorMiddleware(err, c);
});

export default app;
