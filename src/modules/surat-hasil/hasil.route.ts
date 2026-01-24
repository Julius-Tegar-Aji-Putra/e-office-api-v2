/**
 * Surat Hasil Routes (Elysia)
 * Route definition untuk modul drafting SK/ST
 * Path prefix: /api/surat-hasil
 */

import { Elysia } from 'elysia';
import { hasilController } from './hasil.controller';
import {
  hasilQuerySchema,
  letterIdParamSchema,
  documentIdParamSchema,
  createDraftBodySchema,
  updateDraftBodySchema,
  submitVerificationBodySchema
} from './hasil.validation';
import { STAF_ROLES } from '../../shared/constants/roles';

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
// Surat Hasil Routes
// ============================================================================

export const hasilRoutes = new Elysia({ prefix: '/surat-hasil' })
  // ==========================================================================
  // Queue Endpoints
  // ==========================================================================

  .get('/queue', async ({ query, store }) => {
    const user = (store as AuthStore).user;
    return hasilController.getDraftingQueue(user.id, user.roles, {
      page: query.page,
      limit: query.limit,
      search: query.search
    });
  }, {
    query: hasilQuerySchema,
    detail: {
      summary: 'Get drafting queue',
      description: 'Mendapatkan antrian drafting untuk staf',
      tags: ['Surat Hasil']
    }
  })

  .get('/my-drafts', async ({ query, store }) => {
    const user = (store as AuthStore).user;
    return hasilController.getMyDraftedLetters(user.id, {
      page: query.page,
      limit: query.limit,
      documentType: query.documentType as any
    });
  }, {
    query: hasilQuerySchema,
    detail: {
      summary: 'Get my drafted letters',
      description: 'Mendapatkan daftar surat yang pernah di-draft',
      tags: ['Surat Hasil']
    }
  })

  // ==========================================================================
  // Detail Endpoint
  // ==========================================================================

  .get('/:id', async ({ params, store }) => {
    const user = (store as AuthStore).user;
    return hasilController.getLetterDetail(params.id, user.id, user.roles);
  }, {
    params: letterIdParamSchema,
    detail: {
      summary: 'Get letter detail',
      description: 'Mendapatkan detail surat untuk drafting',
      tags: ['Surat Hasil']
    }
  })

  // ==========================================================================
  // Draft Actions
  // ==========================================================================

  .post('/:id/draft', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    const staffRole = user.roles.find(r => (STAF_ROLES as readonly string[]).includes(r)) || user.roles[0];
    return hasilController.createDraft(params.id, body, user.id, staffRole);
  }, {
    params: letterIdParamSchema,
    body: createDraftBodySchema,
    detail: {
      summary: 'Create SK/ST draft',
      description: 'Staf membuat draft SK/ST baru',
      tags: ['Surat Hasil']
    }
  })

  .put('/document/:documentId', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    const staffRole = user.roles.find(r => (STAF_ROLES as readonly string[]).includes(r)) || user.roles[0];
    return hasilController.updateDraft(params.documentId, body, user.id, staffRole);
  }, {
    params: documentIdParamSchema,
    body: updateDraftBodySchema,
    detail: {
      summary: 'Update draft',
      description: 'Staf memperbarui draft SK/ST',
      tags: ['Surat Hasil']
    }
  })

  // ==========================================================================
  // Submit for Verification
  // ==========================================================================

  .post('/:id/submit', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    const staffRole = user.roles.find(r => (STAF_ROLES as readonly string[]).includes(r)) || user.roles[0];
    return hasilController.submitForVerification(params.id, body, user.id, staffRole);
  }, {
    params: letterIdParamSchema,
    body: submitVerificationBodySchema,
    detail: {
      summary: 'Submit for verification',
      description: 'Staf mengajukan draft untuk verifikasi',
      tags: ['Surat Hasil']
    }
  });
