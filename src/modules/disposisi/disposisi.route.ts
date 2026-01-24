/**
 * Disposisi Routes (Elysia)
 * Route definition untuk modul disposisi fakultas
 * Path prefix: /api/disposisi
 */

import { Elysia } from 'elysia';
import { disposisiController } from './disposisi.controller';
import {
  disposisiQuerySchema,
  letterIdParamSchema,
  roleParamSchema,
  categorizeBodySchema,
  forwardBodySchema,
  completeBodySchema,
  returnBodySchema
} from './disposisi.validation';
import { ROLES, PEJABAT_ROLES, FAKULTAS_ROLES } from '../../shared/constants/roles';

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
// Disposisi Routes
// ============================================================================

export const disposisiRoutes = new Elysia({ prefix: '/disposisi' })
  // ==========================================================================
  // Queue Endpoints
  // ==========================================================================

  .get('/incoming', async ({ query }) => {
    return disposisiController.getIncomingLetters({
      page: query.page,
      limit: query.limit,
      search: query.search
    });
  }, {
    query: disposisiQuerySchema,
    detail: {
      summary: 'Get incoming letters',
      description: 'Mendapatkan daftar surat masuk untuk Admin Fakultas',
      tags: ['Disposisi']
    }
  })

  .get('/queue', async ({ query, store }) => {
    const user = (store as AuthStore).user;
    // Find active faculty role
    const activeRole = user.roles.find(r => 
      (PEJABAT_ROLES as readonly string[]).includes(r) ||
      r === ROLES.ADMIN_FAKULTAS
    ) || ROLES.ADMIN_FAKULTAS;

    return disposisiController.getDispositionQueue(activeRole, {
      page: query.page,
      limit: query.limit,
      category: query.category as any,
      search: query.search
    });
  }, {
    query: disposisiQuerySchema,
    detail: {
      summary: 'Get disposition queue',
      description: 'Mendapatkan antrian disposisi untuk pejabat',
      tags: ['Disposisi']
    }
  })

  // ==========================================================================
  // Detail & Users Endpoints
  // ==========================================================================

  .get('/users/:role', async ({ params }) => {
    return disposisiController.getUsersByRole(params.role);
  }, {
    params: roleParamSchema,
    detail: {
      summary: 'Get users by role',
      description: 'Mendapatkan daftar user berdasarkan role untuk dropdown disposisi',
      tags: ['Disposisi']
    }
  })

  .get('/:id', async ({ params, store }) => {
    const user = (store as AuthStore).user;
    return disposisiController.getLetterDetail(params.id, user.id, user.roles);
  }, {
    params: letterIdParamSchema,
    detail: {
      summary: 'Get letter detail',
      description: 'Mendapatkan detail surat dengan konteks disposisi',
      tags: ['Disposisi']
    }
  })

  // ==========================================================================
  // Action Endpoints
  // ==========================================================================

  .post('/:id/categorize', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    return disposisiController.categorizeAndReceive(
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
      tags: ['Disposisi']
    }
  })

  .post('/:id/forward', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    // Find active role for disposition
    const activeRole = user.roles.find(r => 
      (FAKULTAS_ROLES as readonly string[]).includes(r)
    ) || ROLES.ADMIN_FAKULTAS;

    return disposisiController.forwardLetter(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: forwardBodySchema,
    detail: {
      summary: 'Forward letter',
      description: 'Meneruskan/disposisi surat ke role berikutnya',
      tags: ['Disposisi']
    }
  })

  .post('/:id/complete', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    const activeRole = user.roles.find(r => 
      (PEJABAT_ROLES as readonly string[]).includes(r)
    ) || user.roles[0];

    return disposisiController.markComplete(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: completeBodySchema,
    detail: {
      summary: 'Mark as complete',
      description: 'Pejabat menyelesaikan surat tanpa output ST/SK',
      tags: ['Disposisi']
    }
  })

  .post('/:id/return', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    const activeRole = user.roles.find(r => 
      (FAKULTAS_ROLES as readonly string[]).includes(r)
    ) || user.roles[0];

    return disposisiController.returnLetter(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: returnBodySchema,
    detail: {
      summary: 'Return letter',
      description: 'Mengembalikan surat ke role sebelumnya',
      tags: ['Disposisi']
    }
  });
