/**
 * Application Setup
 * Inisialisasi aplikasi (Elysia), registrasi middleware global & routes
 * Framework: Elysia
 */

import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { swagger } from '@elysiajs/swagger';
import { serverTiming } from '@elysiajs/server-timing';
import { env } from './config/env';
import { routes } from './routes';
import { auth } from './lib/auth';
import { prisma } from './db';
import './types'; // Import global type declarations
import { readFile } from 'fs/promises';
import { join } from 'path';

// ============================================
// CREATE ELYSIA APP
// ============================================

const app = new Elysia()
  // ==========================================
  // SWAGGER DOCUMENTATION
  // ==========================================
  .use(
    swagger({
      documentation: {
        info: {
          title: 'E-Office ST/SK Dekan API',
          version: '2.0.0',
          description: 'API untuk sistem E-Office Surat Tugas/Keputusan Dekan',
        },
        tags: [
          { name: 'Auth', description: 'Authentication endpoints' },
          { name: 'Dashboard', description: 'Dashboard endpoints' },
          { name: 'Submission', description: 'Pengajuan surat endpoints' },
          { name: 'Pengantar', description: 'Surat pengantar endpoints' },
          { name: 'Disposisi', description: 'Disposisi fakultas endpoints' },
          { name: 'Surat Hasil', description: 'Drafting surat tugas/keputusan' },
          { name: 'Leadership', description: 'Verifikasi & tanda tangan pejabat' },
          { name: 'Legalisasi', description: 'UPA processing endpoints' },
          { name: 'Master', description: 'Master data endpoints' },
        ],
      },
      path: '/docs',
    })
  )

  // ==========================================
  // CORS CONFIGURATION
  // ==========================================
  .use(
    cors({
      // origin: env.NODE_ENV === 'production' 
      //   ? ['https://e-office.fti.uajy.ac.id']
      //   : ['http://localhost:3001', 'http://localhost:3000', 'http://localhost:5173'],
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  )

  // ==========================================
  // SERVER TIMING
  // ==========================================
  .use(serverTiming())

  // ==========================================
  // REQUEST LOGGING (Development)
  // ==========================================
  .onRequest(({ request }) => {
    if (env.NODE_ENV === 'development') {
      console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`);
    }
  })

  // ==========================================
  // RESPONSE TIMING
  // ==========================================
  .derive(({ request }) => ({
    requestId: crypto.randomUUID(),
    requestTime: Date.now(),
  }))
  .onAfterHandle(({ set, requestTime }) => {
    const responseTime = Date.now() - (requestTime || Date.now());
    set.headers['X-Response-Time'] = `${responseTime}ms`;
  })

  // ==========================================
  // HEALTH CHECK
  // ==========================================
  .get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    environment: env.NODE_ENV,
  }))

  // ==========================================
  // STATIC FILES (Public folder - stempel, logo, etc.)
  // ==========================================
  .get('/stempel.png', async ({ set }) => {
    try {
      const filePath = join(process.cwd(), 'public', 'stempel.png');
      const fileBuffer = await readFile(filePath);
      set.headers['Content-Type'] = 'image/png';
      set.headers['Cache-Control'] = 'public, max-age=86400';
      set.headers['Access-Control-Allow-Origin'] = '*';
      return new Response(fileBuffer, { headers: { 'Content-Type': 'image/png' } });
    } catch (error) {
      console.error('Failed to serve stempel.png:', error);
      set.status = 404;
      return { error: 'Stempel not found' };
    }
  })
  .get('/logo-undip.png', async ({ set }) => {
    try {
      const filePath = join(process.cwd(), 'public', 'logo-undip.png');
      const fileBuffer = await readFile(filePath);
      set.headers['Content-Type'] = 'image/png';
      set.headers['Cache-Control'] = 'public, max-age=86400';
      set.headers['Access-Control-Allow-Origin'] = '*';
      return new Response(fileBuffer, { headers: { 'Content-Type': 'image/png' } });
    } catch (error) {
      console.error('Failed to serve logo-undip.png:', error);
      set.status = 404;
      return { error: 'Logo not found' };
    }
  })
  .get('/api/auth/get-session', async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });

    if (session?.user) {
      const userRoles = await prisma.userRole.findMany({
        where: { userId: session.user.id },
        include: { role: true },
      });
      const roles = userRoles.map((ur) => ur.role.name);

      const isProd = env.NODE_ENV === 'production';
      const response = new Response(
        JSON.stringify({ ...session, user: { ...session.user, roles } }),
        { headers: { 'Content-Type': 'application/json' } }
      );
      response.headers.append(
        'Set-Cookie',
        `user_roles=${roles.join(',')}; Path=/; HttpOnly; SameSite=Lax;${ isProd ? ' Secure;' : '' }`
      );
      return response;
    }

    return new Response(
      JSON.stringify({ session: null, user: null, requiresLogin: true }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': [
            'e-office.session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
            'e-office.session_data=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
            'user_roles=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
          ].join(', '),
        },
      }
    );
  })

  // ==========================================
  // BETTER AUTH HANDLER
  // All auth endpoints: /api/auth/*
  // ==========================================
  .mount(auth.handler)

  // ==========================================
  // 404 HANDLER
  // ==========================================
  .onError(({ code, error, path, set }) => {
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return {
        success: false,
        error: 'Not Found',
        message: 'The requested resource was not found',
        path,
      };
    }

    // Log errors in development
    if (env.NODE_ENV === 'development') {
      console.error('Error:', error);
    }

    // Return generic error response
    const errorStatus = typeof error === 'object' && error !== null && 'status' in error 
      ? (error as { status: number }).status 
      : 500;
    set.status = errorStatus;
    
    const errorMessage = typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message: string }).message
      : 'Internal Server Error';
    
    return {
      success: false,
      error: code,
      message: errorMessage,
    };
  })

  // ==========================================
  // REGISTER ALL ROUTES
  // ==========================================
  .use(routes);

export default app;
export type App = typeof app;
