/**
 * Department Approval Routes (Elysia)
 * Route definition untuk modul department approval (persetujuan & TTD di lingkup departemen)
 * Path prefix: /api/department-approval
 * 
 * Flow: Mahasiswa/Dosen Submit -> Kaprodi Approve/Reject -> Admin Prodi Draft Pengantar -> 
 *       Kaprodi Sign -> Kadep Sign (optional) -> Forward ke Fakultas
 */

import { Elysia, t } from 'elysia';
import { departmentApprovalController } from './department-approval.controller';
import {
  departmentApprovalQuerySchema,
  letterIdParamSchema,
  approveBodySchema,
  rejectBodySchema,
  saveDraftBodySchema,
  signBodySchema
} from './department-approval.validation';
import { ROLES } from '../../shared/constants/roles';
import { authGuardPlugin } from '../../middlewares/auth';
import { getUserRoles } from '../../lib/casbin';

// ============================================================================
// Department Approval Routes
// ============================================================================

export const departmentApprovalRoutes = new Elysia({ prefix: '/department-approval' })
  .use(authGuardPlugin)
  // ==========================================================================
  // Queue Endpoints
  // ==========================================================================

  .get('/kaprodi-queue', async ({ query, user }) => {
    return departmentApprovalController.getKaprodiQueue(user.id, {
      page: query.page,
      limit: query.limit,
      status: query.status as any,
      search: query.search
    });
  }, {
    query: departmentApprovalQuerySchema,
    detail: {
      summary: 'Get Kaprodi approval queue',
      description: 'Mendapatkan daftar surat yang menunggu approval Kaprodi',
      tags: ['Department Approval']
    }
  })

  .get('/kadep-queue', async ({ query, user }) => {
    return departmentApprovalController.getKadepQueue(user.id, {
      page: query.page,
      limit: query.limit,
      status: query.status as any,
      search: query.search
    });
  }, {
    query: departmentApprovalQuerySchema,
    detail: {
      summary: 'Get Kadep approval queue',
      description: 'Mendapatkan daftar surat yang menunggu approval Kadep (untuk prodi tanpa Kaprodi)',
      tags: ['Department Approval']
    }
  })

  .get('/admin-queue', async ({ query, user }) => {
    return departmentApprovalController.getAdminProdiQueue(user.id, {
      page: query.page,
      limit: query.limit,
      status: query.status as any,
      search: query.search
    });
  }, {
    query: departmentApprovalQuerySchema,
    detail: {
      summary: 'Get Admin Prodi drafting queue',
      description: 'Mendapatkan daftar surat yang menunggu drafting Admin Prodi',
      tags: ['Department Approval']
    }
  })

  .get('/signature-queue', async ({ query, user }) => {
    // Determine role for signature queue (KAPRODI or KADEP)
    const roles = await getUserRoles(user.id);
    const signerRole = roles.includes(ROLES.KADEP) ? ROLES.KADEP : ROLES.KAPRODI;
    return departmentApprovalController.getSignatureQueue(user.id, signerRole, {
      page: query.page,
      limit: query.limit
    });
  }, {
    query: departmentApprovalQuerySchema,
    detail: {
      summary: 'Get signature queue',
      description: 'Mendapatkan daftar surat yang menunggu tanda tangan',
      tags: ['Department Approval']
    }
  })

  // ==========================================================================
  // Detail Endpoint
  // ==========================================================================

  .get('/:id', async ({ params, user }) => {
    const roles = await getUserRoles(user.id);
    return departmentApprovalController.getLetterDetail(params.id, user.id, roles);
  }, {
    params: letterIdParamSchema,
    detail: {
      summary: 'Get letter detail',
      description: 'Mendapatkan detail surat beserta permissions untuk department approval',
      tags: ['Department Approval']
    }
  })

  // ==========================================================================
  // Action Endpoints
  // ==========================================================================

  .post('/:id/approve', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const userRole = roles.includes(ROLES.KADEP) ? ROLES.KADEP : ROLES.KAPRODI;
    return departmentApprovalController.approveSubmission(params.id, body, user.id, userRole);
  }, {
    params: letterIdParamSchema,
    body: approveBodySchema,
    detail: {
      summary: 'Approve submission',
      description: 'Kaprodi/Kadep menyetujui pengajuan surat',
      tags: ['Department Approval']
    }
  })

  .post('/:id/reject', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const userRole = roles.includes(ROLES.KADEP) ? ROLES.KADEP : ROLES.KAPRODI;
    return departmentApprovalController.rejectSubmission(params.id, body, user.id, userRole);
  }, {
    params: letterIdParamSchema,
    body: rejectBodySchema,
    detail: {
      summary: 'Reject submission',
      description: 'Kaprodi/Kadep menolak pengajuan surat',
      tags: ['Department Approval']
    }
  })

  .post('/:id/create-draft', async ({ params, user }) => {
    return departmentApprovalController.createInitialDraft(params.id, user.id, ROLES.ADMIN_PRODI);
  }, {
    params: letterIdParamSchema,
    detail: {
      summary: 'Create initial draft',
      description: 'Admin Prodi membuat draft surat pengantar pertama kali',
      tags: ['Department Approval']
    }
  })

  .post('/:id/draft', async ({ params, body, user }) => {
    return departmentApprovalController.saveDraft(params.id, body, user.id, ROLES.ADMIN_PRODI);
  }, {
    params: letterIdParamSchema,
    body: saveDraftBodySchema,
    detail: {
      summary: 'Save draft',
      description: 'Admin Prodi menyimpan draft surat pengantar',
      tags: ['Department Approval']
    }
  })

  .post('/:id/submit-draft', async ({ params, user }) => {
    return departmentApprovalController.submitDraftForSignature(params.id, user.id, ROLES.ADMIN_PRODI);
  }, {
    params: letterIdParamSchema,
    detail: {
      summary: 'Submit draft for signature',
      description: 'Admin Prodi mengajukan draft untuk ditandatangani',
      tags: ['Department Approval']
    }
  })

  .post('/:id/sign', async ({ params, body, user }) => {
    // Get all user's roles
    const roles = await getUserRoles(user.id);
    
    // PERBAIKAN: Get the letter first to check currentActiveRole
    // Then determine which role the user should use based on their roles AND the letter's state
    const letter = await departmentApprovalController.getLetterForSigning(params.id);
    
    // Determine the correct signer role based on the letter's currentActiveRole
    // The user must have the role that matches currentActiveRole
    let signerRole: string;
    if (letter && letter.currentActiveRole) {
      if (roles.includes(letter.currentActiveRole)) {
        signerRole = letter.currentActiveRole;
      } else {
        // Fallback to KAPRODI or KADEP based on what user has
        signerRole = roles.includes(ROLES.KAPRODI) ? ROLES.KAPRODI : ROLES.KADEP;
      }
    } else {
      signerRole = roles.includes(ROLES.KAPRODI) ? ROLES.KAPRODI : ROLES.KADEP;
    }
    
    return departmentApprovalController.signPengantar(params.id, body, user.id, signerRole);
  }, {
    params: letterIdParamSchema,
    body: signBodySchema,
    detail: {
      summary: 'Sign document',
      description: 'Kaprodi/Kadep menandatangani surat pengantar',
      tags: ['Department Approval']
    }
  })

  // ==========================================================================
  // Attachment Endpoints
  // ==========================================================================

  .delete('/:id/attachments/:attachmentId', async ({ params, user }) => {
    return departmentApprovalController.removePengajuAttachment(
      params.id, 
      params.attachmentId, 
      user.id, 
      ROLES.ADMIN_PRODI
    );
  }, {
    params: t.Object({
      id: t.String({ description: 'Letter Instance ID' }),
      attachmentId: t.String({ description: 'Attachment ID' }),
    }),
    detail: {
      summary: 'Remove pengaju attachment',
      description: 'Admin Prodi menghapus lampiran yang di-upload oleh pengaju',
      tags: ['Department Approval']
    }
  })

  // ==========================================================================
  // Validation Endpoints
  // ==========================================================================

  .get('/check-nomor-surat', async ({ query }) => {
    return departmentApprovalController.checkNomorSurat(
      query.nomorSurat,
      query.letterId
    );
  }, {
    query: t.Object({
      nomorSurat: t.String({ description: 'Nomor surat yang akan dicek' }),
      letterId: t.Optional(t.String({ description: 'Letter ID (untuk exclude saat edit)' }))
    }),
    detail: {
      summary: 'Check nomor surat availability',
      description: 'Mengecek apakah nomor surat sudah digunakan atau masih tersedia',
      tags: ['Department Approval']
    }
  });
