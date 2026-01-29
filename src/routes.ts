/**
 * Routes Registry
 * Central route registry - Menggabungkan semua module routes
 * Framework: Elysia
 * NO business logic here, hanya registrasi routes
 */

import { Elysia } from 'elysia';

// Import module routes
import { submissionRoutes } from './modules/submission/submission.route';
import { departmentApprovalRoutes } from './modules/department-approval/department-approval.route';
import { facultyDispositionRoutes } from './modules/faculty-disposition/faculty-disposition.route';
import { facultyApprovalRoutes } from './modules/faculty-approval/faculty-approval.route';
import { hasilRoutes } from './modules/surat-hasil/hasil.route';
import { signingRoutes } from './modules/surat-hasil/signing.route';
import { legalisasiRoute } from './modules/legalisasi/legalisasi.route';
import { signatureRoutes } from './modules/signature/signature.route';
import { tembusanRoute } from './modules/tembusan/tembusan.route';

// Import existing routes
import dashRoutes from './routes/dash';
import meRoutes from './routes/me';

// Import Better Auth routes
import betterAuthRoutes from './routes/public/auth';

// Import Public Verification routes
import verificationRoute from './routes/public/verification';

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

    // Module B: DEPARTMENT APPROVAL (formerly: pengantar)
    .group('/api', (api) => api.use(departmentApprovalRoutes))

    // Module C: FACULTY DISPOSITION (formerly: disposisi)
    .group('/api', (api) => api.use(facultyDispositionRoutes))

    // Module D: SURAT HASIL
    .group('/api', (api) => api.use(hasilRoutes))

    // Module D.1: SIGNING (Part of Surat Hasil)
    .group('/api', (api) => api.use(signingRoutes))

    // Module E: FACULTY APPROVAL (formerly: leadership)
    .group('/api', (api) => api.use(facultyApprovalRoutes))

    // Module F: LEGALISASI (UPA Finishing)
    .group('/api', (api) => api.use(legalisasiRoute))

    // Module G: SIGNATURE (Saved Signatures Management)
    .group('/api', (api) => api.use(signatureRoutes))

    // Module H: TEMBUSAN (Received Documents)
    .use(tembusanRoute)

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
    .use(betterAuthRoutes)
    // Public verification routes (no auth required)
    .use(verificationRoute);
}

// ============================================================================
// REGISTER ALL ROUTES
// ============================================================================

export const routes = new Elysia()
  .use(createPublicRoutes())
  .use(createApiRoutes());
