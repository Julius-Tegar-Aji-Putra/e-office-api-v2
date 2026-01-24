/**
 * Faculty Approval Routes (Elysia)
 * Route definition untuk modul verifikasi & tanda tangan pejabat fakultas
 * Path prefix: /api/faculty-approval
 */

import { Elysia } from 'elysia';
import { facultyApprovalController } from './faculty-approval.controller';
import {
  facultyApprovalQuerySchema,
  letterIdParamSchema,
  documentIdParamSchema,
  verifyBodySchema,
  signBodySchema,
  returnBodySchema,
  updateDraftBodySchema
} from './faculty-approval.validation';
import { PEJABAT_ROLES, SIGNATORY_ROLES } from '../../shared/constants/roles';
import { authGuardPlugin } from '../../middlewares/auth';
import { getUserRoles } from '../../lib/casbin';

// ============================================================================
// Faculty Approval Routes
// ============================================================================

export const facultyApprovalRoutes = new Elysia({ prefix: '/faculty-approval' })
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

    return facultyApprovalController.getVerificationQueue(activeRole, {
      page: query.page,
      limit: query.limit,
      category: query.category as any,
      search: query.search
    });
  }, {
    query: facultyApprovalQuerySchema,
    detail: {
      summary: 'Get verification queue',
      description: 'Mendapatkan antrian verifikasi/tanda tangan untuk pejabat',
      tags: ['Faculty Approval']
    }
  })

  // ==========================================================================
  // Detail Endpoint
  // ==========================================================================

  .get('/:id', async ({ params, user }) => {
    const roles = await getUserRoles(user.id);
    return facultyApprovalController.getLetterDetail(params.id, user.id, roles);
  }, {
    params: letterIdParamSchema,
    detail: {
      summary: 'Get letter detail',
      description: 'Mendapatkan detail surat dengan konteks verifikasi',
      tags: ['Faculty Approval']
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

    return facultyApprovalController.verifyDocument(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: verifyBodySchema,
    detail: {
      summary: 'Verify document',
      description: 'Memverifikasi dokumen dan meneruskan ke level berikutnya',
      tags: ['Faculty Approval']
    }
  })

  .post('/:id/sign', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r =>
      (SIGNATORY_ROLES as readonly string[]).includes(r)
    ) || roles[0];

    return facultyApprovalController.signDocument(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: signBodySchema,
    detail: {
      summary: 'Sign document',
      description: 'Menandatangani dokumen SK/ST',
      tags: ['Faculty Approval']
    }
  })

  .post('/:id/return', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r =>
      (PEJABAT_ROLES as readonly string[]).includes(r) ||
      (SIGNATORY_ROLES as readonly string[]).includes(r)
    ) || roles[0];

    return facultyApprovalController.returnDocument(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: returnBodySchema,
    detail: {
      summary: 'Return document',
      description: 'Mengembalikan dokumen ke role sebelumnya',
      tags: ['Faculty Approval']
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

    return facultyApprovalController.updateDraft(params.documentId, body, user.id, activeRole);
  }, {
    params: documentIdParamSchema,
    body: updateDraftBodySchema,
    detail: {
      summary: 'Update draft',
      description: 'Supervisor memperbarui draft dokumen',
      tags: ['Faculty Approval']
    }
  });
