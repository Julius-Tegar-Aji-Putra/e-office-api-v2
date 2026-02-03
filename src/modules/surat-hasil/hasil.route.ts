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
  submitVerificationBodySchema,
  approveVerificationBodySchema,
  returnRevisionBodySchema,
  signDocumentBodySchema,
  createStaffSuratBodySchema,
  uploadAttachmentsBodySchema
} from './hasil.validation';
import { STAF_ROLES, PEJABAT_ROLES } from '../../shared/constants/roles';
import { authGuardPlugin } from '../../middlewares/auth';
import { getUserRoles } from '../../lib/casbin';

// ============================================================================
// Surat Hasil Routes
// ============================================================================

export const hasilRoutes = new Elysia({ prefix: '/surat-hasil' })
  .use(authGuardPlugin)
  
  // ==========================================================================
  // Create Staff Surat (tanpa submission)
  // ==========================================================================

  .post('/create', async ({ body, user }) => {
    const roles = await getUserRoles(user.id);
    const staffRole = roles.find(r => (STAF_ROLES as readonly string[]).includes(r)) || roles[0];
    return hasilController.createStaffSurat(body, user.id, staffRole);
  }, {
    body: createStaffSuratBodySchema,
    detail: {
      summary: 'Create staff surat directly',
      description: 'Staf membuat surat langsung tanpa melalui submission',
      tags: ['Surat Hasil']
    }
  })
  
  // ==========================================================================
  // Queue Endpoints
  // ==========================================================================

  .get('/queue', async ({ query, user }) => {
    const roles = await getUserRoles(user.id);
    return hasilController.getDraftingQueue(user.id, roles, {
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

  .get('/my-drafts', async ({ query, user }) => {
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

  .get('/:id', async ({ params, user }) => {
    const roles = await getUserRoles(user.id);
    return hasilController.getLetterDetail(params.id, user.id, roles);
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

  .post('/:id/draft', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const staffRole = roles.find(r => (STAF_ROLES as readonly string[]).includes(r)) || roles[0];
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

  .put('/document/:documentId', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const staffRole = roles.find(r => (STAF_ROLES as readonly string[]).includes(r)) || roles[0];
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

  .post('/:id/submit', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const staffRole = roles.find(r => (STAF_ROLES as readonly string[]).includes(r)) || roles[0];
    return hasilController.submitForVerification(params.id, body, user.id, staffRole);
  }, {
    params: letterIdParamSchema,
    body: submitVerificationBodySchema,
    detail: {
      summary: 'Submit for verification',
      description: 'Staf mengajukan draft untuk verifikasi',
      tags: ['Surat Hasil']
    }
  })

  // ==========================================================================
  // Supervisor/Manajer TU Verification Actions
  // ==========================================================================

  .post('/:id/approve', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    // Find supervisor or manajer TU role
    const activeRole = roles.find(r => 
      ['SUPERVISOR_AKADEMIK', 'SUPERVISOR_SUMBER_DAYA', 'MANAJER_TU'].includes(r)
    ) || roles[0];
    return hasilController.approveVerification(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: approveVerificationBodySchema,
    detail: {
      summary: 'Approve verification',
      description: 'Supervisor verifikasi → Manajer TU, atau Manajer TU verifikasi → Signing',
      tags: ['Surat Hasil']
    }
  })

  .put('/:id/supervisor-edit', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r => 
      ['SUPERVISOR_AKADEMIK', 'SUPERVISOR_SUMBER_DAYA', 'MANAJER_TU'].includes(r)
    ) || roles[0];
    return hasilController.updateDraftAsSupervisor(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: updateDraftBodySchema,
    detail: {
      summary: 'Supervisor/Manajer TU edit draft',
      description: 'Supervisor atau Manajer TU mengedit draft SK/ST',
      tags: ['Surat Hasil']
    }
  })

  .post('/:id/return', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    // Allow: Supervisor, Manajer TU, dan Pejabat (Wadek/Dekan)
    const activeRole = roles.find(r => 
      ['SUPERVISOR_AKADEMIK', 'SUPERVISOR_SUMBER_DAYA', 'MANAJER_TU', 'WADEK_1', 'WADEK_2', 'DEKAN'].includes(r)
    ) || roles[0];
    return hasilController.returnForRevision(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: returnRevisionBodySchema,
    detail: {
      summary: 'Return for revision',
      description: 'Supervisor/Manajer TU/Pejabat mengembalikan draft untuk diperbaiki (FLEKSIBEL - bisa skip role)',
      tags: ['Surat Hasil']
    }
  })

  // ==========================================================================
  // Pejabat (Wadek/Dekan) Verification Actions
  // PENTING: Untuk pejabat yang BUKAN penandatangan, hanya verifikasi
  // ==========================================================================

  .post('/:id/pejabat-verify', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r => 
      (PEJABAT_ROLES as readonly string[]).includes(r)
    ) || roles[0];
    return hasilController.pejabatVerifyDocument(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: approveVerificationBodySchema,
    detail: {
      summary: 'Pejabat verify SK/ST (bukan penandatangan)',
      description: 'Pejabat (Wadek/Dekan) yang BUKAN penandatangan memverifikasi dan meneruskan ke next role',
      tags: ['Surat Hasil']
    }
  })

  // ==========================================================================
  // Signing Actions (Dekan/Wadek)
  // ==========================================================================

  .post('/:id/sign', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r => 
      (PEJABAT_ROLES as readonly string[]).includes(r)
    ) || roles[0];
    return hasilController.signDocument(params.id, body, user.id, activeRole);
  }, {
    params: letterIdParamSchema,
    body: signDocumentBodySchema,
    detail: {
      summary: 'Sign SK/ST document',
      description: 'Pejabat (Dekan/Wadek) menandatangani dokumen SK/ST',
      tags: ['Surat Hasil']
    }
  })

  // ==========================================================================
  // Attachment Management (Staff/Supervisor only)
  // ==========================================================================

  .get('/document/:documentId/attachments', async ({ params, user }) => {
    return hasilController.getAttachments(params.documentId);
  }, {
    params: documentIdParamSchema,
    detail: {
      summary: 'Get document attachments',
      description: 'Mendapatkan daftar lampiran dokumen',
      tags: ['Surat Hasil']
    }
  })

  .post('/document/:documentId/attachments', async ({ params, body, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r => 
      [...STAF_ROLES, 'SUPERVISOR_AKADEMIK', 'SUPERVISOR_SUMBER_DAYA'].includes(r)
    ) || roles[0];
    
    // body.files is already an array of File objects from t.Files()
    const files = body.files || [];
    
    return hasilController.uploadAttachments(params.documentId, files, user.id, activeRole);
  }, {
    params: documentIdParamSchema,
    body: uploadAttachmentsBodySchema,
    detail: {
      summary: 'Upload attachments',
      description: 'Staff/Supervisor mengunggah lampiran (PDF, JPG, PNG)',
      tags: ['Surat Hasil']
    }
  })

  // IMPORTANT: More specific route MUST come BEFORE generic route
  // Route '/attachments/file/:fileName' must be before '/attachments/:index'
  .delete('/document/:documentId/attachments/file/:fileName', async ({ params, user }) => {
    try {
      console.log('[DELETE ATTACHMENT] Received request:', {
        documentId: params.documentId,
        fileName: params.fileName,
        user: user.id
      });
      
      const roles = await getUserRoles(user.id);
      const activeRole = roles.find(r => 
        [...STAF_ROLES, 'SUPERVISOR_AKADEMIK', 'SUPERVISOR_SUMBER_DAYA'].includes(r)
      ) || roles[0];
      
      const result = await hasilController.removeAttachmentByName(
        params.documentId, 
        params.fileName, 
        user.id, 
        activeRole
      );
      
      console.log('[DELETE ATTACHMENT] Success:', result);
      return result;
    } catch (error) {
      console.error('[DELETE ATTACHMENT] Error:', error);
      throw error;
    }
  }, {
    detail: {
      summary: 'Remove attachment by fileName',
      description: 'Staff/Supervisor menghapus lampiran berdasarkan nama file',
      tags: ['Surat Hasil']
    }
  })

  .delete('/document/:documentId/attachments/:index', async ({ params, user }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles.find(r => 
      [...STAF_ROLES, 'SUPERVISOR_AKADEMIK', 'SUPERVISOR_SUMBER_DAYA'].includes(r)
    ) || roles[0];
    
    const index = parseInt(params.index, 10);
    return hasilController.removeAttachment(params.documentId, index, user.id, activeRole);
  }, {
    detail: {
      summary: 'Remove attachment by index',
      description: 'Staff/Supervisor menghapus lampiran berdasarkan index',
      tags: ['Surat Hasil']
    }
  });
