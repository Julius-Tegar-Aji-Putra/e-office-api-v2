/**
 * Pengantar Routes (Elysia)
 * Route definition untuk modul surat pengantar
 * Path prefix: /api/pengantar
 */

import { Elysia } from 'elysia';
import { pengantarController } from './pengantar.controller';
import {
  pengantarQuerySchema,
  letterIdParamSchema,
  approveBodySchema,
  rejectBodySchema,
  saveDraftBodySchema,
  signBodySchema
} from './pengantar.validation';
import { ROLES } from '../../shared/constants/roles';

// ============================================================================
// Type definitions for context
// ============================================================================

interface AuthUser {
  id: string;
  email: string;
  roles: string[];
}

interface AuthStore {
  user: AuthUser;
}

// ============================================================================
// Pengantar Routes
// ============================================================================

export const pengantarRoutes = new Elysia({ prefix: '/pengantar' })
  // ==========================================================================
  // Queue Endpoints
  // ==========================================================================

  .get('/kaprodi-queue', async ({ query, store }) => {
    const user = (store as AuthStore).user;
    return pengantarController.getKaprodiQueue(user.id, {
      page: query.page,
      limit: query.limit,
      status: query.status as any,
      search: query.search
    });
  }, {
    query: pengantarQuerySchema,
    detail: {
      summary: 'Get Kaprodi approval queue',
      description: 'Mendapatkan daftar surat yang menunggu approval Kaprodi',
      tags: ['Pengantar']
    }
  })

  .get('/admin-queue', async ({ query, store }) => {
    const user = (store as AuthStore).user;
    return pengantarController.getAdminProdiQueue(user.id, {
      page: query.page,
      limit: query.limit,
      status: query.status as any,
      search: query.search
    });
  }, {
    query: pengantarQuerySchema,
    detail: {
      summary: 'Get Admin Prodi drafting queue',
      description: 'Mendapatkan daftar surat yang menunggu drafting Admin Prodi',
      tags: ['Pengantar']
    }
  })

  .get('/signature-queue', async ({ query, store }) => {
    const user = (store as AuthStore).user;
    // Determine role for signature queue (KAPRODI or KADEP)
    const signerRole = user.roles.includes(ROLES.KADEP) ? ROLES.KADEP : ROLES.KAPRODI;
    return pengantarController.getSignatureQueue(user.id, signerRole, {
      page: query.page,
      limit: query.limit
    });
  }, {
    query: pengantarQuerySchema,
    detail: {
      summary: 'Get signature queue',
      description: 'Mendapatkan daftar surat yang menunggu tanda tangan',
      tags: ['Pengantar']
    }
  })

  // ==========================================================================
  // Detail Endpoint
  // ==========================================================================

  .get('/:id', async ({ params, store }) => {
    const user = (store as AuthStore).user;
    return pengantarController.getLetterDetail(params.id, user.id, user.roles);
  }, {
    params: letterIdParamSchema,
    detail: {
      summary: 'Get letter detail',
      description: 'Mendapatkan detail surat pengantar beserta permissions',
      tags: ['Pengantar']
    }
  })

  // ==========================================================================
  // Action Endpoints
  // ==========================================================================

  .post('/:id/approve', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    return pengantarController.approveSubmission(params.id, body, user.id, ROLES.KAPRODI);
  }, {
    params: letterIdParamSchema,
    body: approveBodySchema,
    detail: {
      summary: 'Approve submission',
      description: 'Kaprodi menyetujui pengajuan surat',
      tags: ['Pengantar']
    }
  })

  .post('/:id/reject', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    return pengantarController.rejectSubmission(params.id, body, user.id, ROLES.KAPRODI);
  }, {
    params: letterIdParamSchema,
    body: rejectBodySchema,
    detail: {
      summary: 'Reject submission',
      description: 'Kaprodi menolak pengajuan surat',
      tags: ['Pengantar']
    }
  })

  .post('/:id/draft', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    return pengantarController.saveDraft(params.id, body, user.id, ROLES.ADMIN_PRODI);
  }, {
    params: letterIdParamSchema,
    body: saveDraftBodySchema,
    detail: {
      summary: 'Save draft',
      description: 'Admin Prodi menyimpan draft surat pengantar',
      tags: ['Pengantar']
    }
  })

  .post('/:id/submit-draft', async ({ params, store }) => {
    const user = (store as AuthStore).user;
    return pengantarController.submitDraftForSignature(params.id, user.id, ROLES.ADMIN_PRODI);
  }, {
    params: letterIdParamSchema,
    detail: {
      summary: 'Submit draft for signature',
      description: 'Admin Prodi mengajukan draft untuk ditandatangani',
      tags: ['Pengantar']
    }
  })

  .post('/:id/sign', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    // Determine signer role
    const signerRole = user.roles.includes(ROLES.KADEP) ? ROLES.KADEP : ROLES.KAPRODI;
    return pengantarController.signPengantar(params.id, body, user.id, signerRole);
  }, {
    params: letterIdParamSchema,
    body: signBodySchema,
    detail: {
      summary: 'Sign document',
      description: 'Kaprodi/Kadep menandatangani surat pengantar',
      tags: ['Pengantar']
    }
  });
