/**
 * Routes Registry
 * Central route registry - Menggabungkan semua module routes
 * NO business logic here, hanya registrasi routes
 */

import { Hono } from 'hono';

// Import module routes
import { submissionRoutes } from './modules/submission/submission.route';
import { pengantarRoutes } from './modules/pengantar/pengantar.route';
import { disposisiRoutes } from './modules/disposisi/disposisi.route';
import { leadershipRoutes } from './modules/leadership/leadership.route';
import { hasilRoutes } from './modules/surat-hasil/hasil.route';
import { legalisasiRoutes } from './modules/legalisasi/legalisasi.route';

// Import existing routes (backward compatibility)
// NOTE: Routes lama masih menggunakan Elysia, perlu dimigrasi ke Hono
// Sementara di-comment untuk menghindari type errors
// import dashRoutes from './routes/dash';
// import meRoutes from './routes/me';
// import masterDepartemenRoutes from './routes/master/departemen';
// import masterMahasiswaRoutes from './routes/master/mahasiswa';
// import masterPegawaiRoutes from './routes/master/pegawai';
// import masterPermissionRoutes from './routes/master/permission';
// import masterProdiRoutes from './routes/master/prodi';
// import masterRoleRoutes from './routes/master/role';
// import masterSuratTemplateRoutes from './routes/master/suratTemplate';
// import masterSuratTypeRoutes from './routes/master/suratType';
// import masterUserRoutes from './routes/master/user';
// import publicRegisterRoutes from './routes/public/register';
// import publicSignInRoutes from './routes/public/sign-in';
// import publicSsoCallbackRoutes from './routes/public/auth/sso/callback';

export function registerRoutes(app: Hono) {
  // Public routes (no auth required)
  // TODO: Migrate old Elysia routes to Hono
  // app.route('/public/register', publicRegisterRoutes);
  // app.route('/public/sign-in', publicSignInRoutes);
  // app.route('/public/auth/sso/callback', publicSsoCallbackRoutes);

  // Protected routes - New modular structure
  app.route('/api/submission', submissionRoutes);
  app.route('/api/pengantar', pengantarRoutes);
  app.route('/api/disposisi', disposisiRoutes);
  app.route('/api/leadership', leadershipRoutes);
  app.route('/api/surat-hasil', hasilRoutes);
  app.route('/api/legalisasi', legalisasiRoutes);

  // Protected routes - Legacy/Existing structure
  // TODO: Migrate old Elysia routes to Hono structure
  // app.route('/api/dash', dashRoutes);
  // app.route('/api/me', meRoutes);
  
  // Master data routes
  // TODO: Create new Hono-based master data modules
  // app.route('/api/master/departemen', masterDepartemenRoutes);
  // app.route('/api/master/mahasiswa', masterMahasiswaRoutes);
  // app.route('/api/master/pegawai', masterPegawaiRoutes);
  // app.route('/api/master/permission', masterPermissionRoutes);
  // app.route('/api/master/prodi', masterProdiRoutes);
  // app.route('/api/master/role', masterRoleRoutes);
  // app.route('/api/master/surat-template', masterSuratTemplateRoutes);
  // app.route('/api/master/surat-type', masterSuratTypeRoutes);
  // app.route('/api/master/user', masterUserRoutes);

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
}
