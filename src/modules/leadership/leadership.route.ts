/**
 * Leadership Routes (Elysia)
 * Route definition untuk modul verifikasi & tanda tangan pejabat
 * Path prefix: /api/leadership
 */

import { Elysia } from 'elysia';
import { leadershipController } from './leadership.controller';
import {
  leadershipQuerySchema,
  letterIdParamSchema,
  documentIdParamSchema,
  verifyBodySchema,
  signBodySchema,
  returnBodySchema,
  updateDraftBodySchema
} from './leadership.validation';
import { PEJABAT_ROLES, SIGNATORY_ROLES } from '../../shared/constants/roles';
import { authGuardPlugin } from '../../middlewares/auth';
import { getUserRoles } from '../../lib/casbin';

// ============================================================================
// Leadership Routes
// ============================================================================

export const leadershipRoutes = new Elysia({ prefix: '/leadership' })
  .use(authGuardPlugin)
  // ==========================================================================
  // Queue Endpoint
  // ==========================================================================

  .get('/queue', async ({ query, user }) => {
    // Find active pejabat role
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r =>
      (PEJABAT_ROLES as readonly string[]).includes(r) ||
      (SIGNATORY_ROLES as readonly string[]).includes(r)
    ) || roles[0];

    return leadershipController.getVerificationQueue(activeRole, {
      page: query.page,
      limit: query.limit,
      category: query.category as any,
      search: query.search
    });
  }, {
    query: leadershipQuerySchema,
    detail: {
      summary: 'Get verification queue',
      description: 'Mendapatkan antrian verifikasi/tanda tangan untuk pejabat',
      tags: ['Leadership']
    }
  })

  // ==========================================================================
  // Detail Endpoint
  // ==========================================================================

  .get('/:id', async ({ params, user }) => {
    const roles = await getUserRoles(user.id);
    return leadershipController.getLetterDetail(params.id, user.id, roles);
  }, {
    params: letterIdParamSchema,
    detail: {
      summary: 'Get letter detail',
      description: 'Mendapatkan detail surat dengan konteks verifikasi',
      tags: ['Leadership']
    }
  })

  // ==========================================================================
  // Action Endpoints
  // ==========================================================================

  .post('/:id/verify', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r =>
      (PEJABAT_ROLES as readonly string[]).includes(r)
    ) || roles[0];

    return leadershipController.verifyDocument(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: verifyBodySchema,
    detail: {
      summary: 'Verify document',
      description: 'Memverifikasi dokumen dan meneruskan ke level berikutnya',
      tags: ['Leadership']
    }
  })

  .post('/:id/sign', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r =>
      (SIGNATORY_ROLES as readonly string[]).includes(r)
    ) || roles[0];

    return leadershipController.signDocument(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: signBodySchema,
    detail: {
      summary: 'Sign document',
      description: 'Menandatangani dokumen SK/ST',
      tags: ['Leadership']
    }
  })

  .post('/:id/return', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r =>
      (PEJABAT_ROLES as readonly string[]).includes(r) ||
      (SIGNATORY_ROLES as readonly string[]).includes(r)
    ) || roles[0];

    return leadershipController.returnDocument(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: returnBodySchema,
    detail: {
      summary: 'Return document',
      description: 'Mengembalikan dokumen ke role sebelumnya',
      tags: ['Leadership']
    }
  })

  // ==========================================================================
  // Draft Edit (Supervisor Only)
  // ==========================================================================

  .put('/document/:documentId', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r =>
      ['SUPERVISOR_AKADEMIK', 'SUPERVISOR_SUMBER_DAYA'].includes(r)
    ) || roles[0];

    return leadershipController.updateDraft(params.documentId, body, user.id, activeRole);
  }, {
    params: documentIdParamSchema,
    body: updateDraftBodySchema,
    detail: {
      summary: 'Update draft',
      description: 'Supervisor memperbarui draft dokumen',
      tags: ['Leadership']
    }
  });
