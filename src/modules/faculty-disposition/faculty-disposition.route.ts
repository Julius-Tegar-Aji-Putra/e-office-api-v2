/**
 * Faculty Disposition Routes (Elysia)
 * Route definition untuk modul disposisi fakultas
 * Path prefix: /api/faculty-disposition
 */

import { Elysia } from 'elysia';
import { facultyDispositionController } from './faculty-disposition.controller';
import {
  dispositionQuerySchema,
  letterIdParamSchema,
  roleParamSchema,
  categorizeBodySchema,
  forwardBodySchema,
  completeBodySchema,
  returnBodySchema
} from './faculty-disposition.validation';
import { ROLES, PEJABAT_ROLES, FAKULTAS_ROLES } from '../../shared/constants/roles';
import { authGuardPlugin } from '../../middlewares/auth';
import { getUserRoles } from '../../lib/casbin';

// ============================================================================
// Faculty Disposition Routes
// ============================================================================

export const facultyDispositionRoutes = new Elysia({ prefix: '/faculty-disposition' })
  .use(authGuardPlugin)
  // ==========================================================================
  // Queue Endpoints
  // ==========================================================================

  .get('/incoming', async ({ query }) => {
    return facultyDispositionController.getIncomingLetters({
      page: query.page,
      limit: query.limit,
      search: query.search
    });
  }, {
    query: dispositionQuerySchema,
    detail: {
      summary: 'Get incoming letters',
      description: 'Mendapatkan daftar surat masuk untuk Admin Fakultas',
      tags: ['Faculty Disposition']
    }
  })

  .get('/queue', async ({ query, user }) => {
    // Find active faculty role
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r => 
      (PEJABAT_ROLES as readonly string[]).includes(r) ||
      r === ROLES.ADMIN_FAKULTAS
    ) || ROLES.ADMIN_FAKULTAS;

    return facultyDispositionController.getDispositionQueue(activeRole, {
      page: query.page,
      limit: query.limit,
      category: query.category as any,
      search: query.search
    });
  }, {
    query: dispositionQuerySchema,
    detail: {
      summary: 'Get disposition queue',
      description: 'Mendapatkan antrian disposisi untuk pejabat',
      tags: ['Faculty Disposition']
    }
  })

  // ==========================================================================
  // Detail & Users Endpoints
  // ==========================================================================

  .get('/users/:role', async ({ params }) => {
    return facultyDispositionController.getUsersByRole(params.role);
  }, {
    params: roleParamSchema,
    detail: {
      summary: 'Get users by role',
      description: 'Mendapatkan daftar user berdasarkan role untuk dropdown disposisi',
      tags: ['Faculty Disposition']
    }
  })

  .get('/:id', async ({ params, user }) => {
    const roles = await getUserRoles(user.id);
    return facultyDispositionController.getLetterDetail(params.id, user.id, roles);
  }, {
    params: letterIdParamSchema,
    detail: {
      summary: 'Get letter detail',
      description: 'Mendapatkan detail surat dengan konteks disposisi',
      tags: ['Faculty Disposition']
    }
  })

  // ==========================================================================
  // Action Endpoints
  // ==========================================================================

  .post('/:id/categorize', async ({ params, body, user }) => {
    return facultyDispositionController.categorizeAndReceive(
      params.id,
      body,
      user.id,
      ROLES.ADMIN_FAKULTAS
    );
  }, {
    params: letterIdParamSchema,
    body: categorizeBodySchema,
    detail: {
      summary: 'Categorize incoming letter',
      description: 'Admin Fakultas mengkategorikan surat masuk',
      tags: ['Faculty Disposition']
    }
  })

  .post('/:id/forward', async ({ params, body, user }) => {
    // Find active role for disposition
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r => 
      (FAKULTAS_ROLES as readonly string[]).includes(r)
    ) || ROLES.ADMIN_FAKULTAS;

    return facultyDispositionController.forwardLetter(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: forwardBodySchema,
    detail: {
      summary: 'Forward letter',
      description: 'Meneruskan/disposisi surat ke role berikutnya',
      tags: ['Faculty Disposition']
    }
  })

  .post('/:id/complete', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r => 
      (PEJABAT_ROLES as readonly string[]).includes(r)
    ) || roles[0];

    return facultyDispositionController.markComplete(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: completeBodySchema,
    detail: {
      summary: 'Mark as complete',
      description: 'Pejabat menyelesaikan surat tanpa output ST/SK (catatan WAJIB)',
      tags: ['Faculty Disposition']
    }
  })

  .post('/:id/return', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r => 
      (FAKULTAS_ROLES as readonly string[]).includes(r)
    ) || roles[0];

    return facultyDispositionController.returnLetter(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: returnBodySchema,
    detail: {
      summary: 'Return letter',
      description: 'Mengembalikan surat ke role sebelumnya (alasan WAJIB). Jika dikembalikan ke ADMIN_PRODI = surat selesai (dead end)',
      tags: ['Faculty Disposition']
    }
  });
