/**
 * Routes Registry
 * Central route registry - Menggabungkan semua module routes
 * Framework: Elysia
 * NO business logic here, hanya registrasi routes
 */

import { Elysia } from 'elysia';

// Import module routes
import { submissionRoutes } from './modules/submission/submission.route';
import { pengantarRoutes } from './modules/pengantar/pengantar.route';
import { disposisiRoutes } from './modules/disposisi/disposisi.route';
import { leadershipRoutes } from './modules/leadership/leadership.route';
import { hasilRoutes } from './modules/surat-hasil/hasil.route';
import { legalisasiRoute } from './modules/legalisasi/legalisasi.route';

// Import existing routes
import dashRoutes from './routes/dash';
import meRoutes from './routes/me';

// Import Better Auth routes
import betterAuthRoutes from './routes/public/auth';

// Import master routes - disabled for now
// import masterDepartemenRoutes from './routes/master/departemen';
// import masterMahasiswaRoutes from './routes/master/mahasiswa';
// import masterPegawaiRoutes from './routes/master/pegawai';
// import masterPermissionRoutes from './routes/master/permission';
// import masterProdiRoutes from './routes/master/prodi';
// import masterRoleRoutes from './routes/master/role';
// import masterSuratTemplateRoutes from './routes/master/suratTemplate';
// import masterSuratTypeRoutes from './routes/master/suratType';
// import masterUserRoutes from './routes/master/user';

// ============================================================================
// ROUTES REGISTRY
// ============================================================================

export function createApiRoutes() {
  return new Elysia()
    // Health check
    .get('/api/health', () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
    }))

    // =========================================================================
    // MODULE ROUTES (New Implementation)
    // =========================================================================

    // Module A: PENGAJUAN (Submission)
    .group('/api', (api) => api.use(submissionRoutes))

    // Module B: SURAT PENGANTAR
    .use(pengantarRoutes)

    // Module C: DISPOSISI
    .use(disposisiRoutes)

    // Module D: SURAT HASIL
    .use(hasilRoutes)

    // Module E: LEADERSHIP (Verification & Signing)
    .use(leadershipRoutes)

    // Module F: LEGALISASI (UPA Finishing)
    .use(legalisasiRoute)

    // =========================================================================
    // DASHBOARD ROUTES
    // =========================================================================
    .group('/dash', (dash) => dash.use(dashRoutes))
    .group('/me', (me) => me.use(meRoutes));

    // =========================================================================
    // MASTER DATA ROUTES - disabled for now
    // =========================================================================
    // .group('/api/master', (master) =>
    //   master
    //     .use(masterDepartemenRoutes)
    //     .use(masterMahasiswaRoutes)
    //     .use(masterPegawaiRoutes)
    //     .use(masterPermissionRoutes)
    //     .use(masterProdiRoutes)
    //     .use(masterRoleRoutes)
    //     .use(masterSuratTemplateRoutes)
    //     .use(masterSuratTypeRoutes)
    //     .use(masterUserRoutes)
    // );
}

export function createPublicRoutes() {
  return new Elysia()
    // Better Auth routes (handles sign-up, sign-in, sign-out, etc.)
    .use(betterAuthRoutes);
}

// ============================================================================
// REGISTER ALL ROUTES
// ============================================================================

export const routes = new Elysia()
  .use(createPublicRoutes())
  .use(createApiRoutes());
