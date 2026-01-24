/**
 * Submission Routes (Elysia)
 * Route definition untuk modul pengajuan surat
 * Path prefix: /api/submission
 */

import { Elysia } from 'elysia';
import { submissionController } from './submission.controller';
import {
  createSubmissionSchema,
  updateSubmissionSchema,
  submissionQuerySchema,
  submissionIdParamSchema,
  cancelSubmissionSchema,
} from './submission.validation';
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
// Submission Routes
// ============================================================================

export const submissionRoutes = new Elysia({ prefix: '/submission' })
  // ==========================================================================
  // Letter Types (Public untuk form pengajuan)
  // ==========================================================================
  
  .get('/letter-types', async () => {
    return submissionController.getLetterTypes();
  }, {
    detail: {
      summary: 'Get all letter types',
      description: 'Mendapatkan daftar semua jenis surat yang tersedia untuk pengajuan',
      tags: ['Submission'],
    },
  })

  .get('/letter-types/:id', async ({ params }) => {
    return submissionController.getLetterTypeById(params.id);
  }, {
    params: submissionIdParamSchema,
    detail: {
      summary: 'Get letter type by ID',
      description: 'Mendapatkan detail jenis surat beserta schema form',
      tags: ['Submission'],
    },
  })

  // ==========================================================================
  // Submissions CRUD (Requires Auth)
  // ==========================================================================

  .get('/', async ({ query, store }) => {
    const user = (store as AuthStore).user;
    return submissionController.getMySubmissions(user.id, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      letterTypeId: query.letterTypeId,
      category: query.category,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }, {
    query: submissionQuerySchema,
    detail: {
      summary: 'Get my submissions',
      description: 'Mendapatkan daftar pengajuan surat user yang sedang login (Mahasiswa/Dosen)',
      tags: ['Submission'],
    },
  })

  .get('/:id', async ({ params, store }) => {
    const user = (store as AuthStore).user;
    return submissionController.getSubmissionById(params.id, user.id, user.roles);
  }, {
    params: submissionIdParamSchema,
    detail: {
      summary: 'Get submission by ID',
      description: 'Mendapatkan detail pengajuan surat beserta dokumen, lampiran, dan riwayat',
      tags: ['Submission'],
    },
  })

  .post('/', async ({ body, store }) => {
    const user = (store as AuthStore).user;
    return submissionController.createSubmission(user.id, body);
  }, {
    body: createSubmissionSchema,
    detail: {
      summary: 'Create new submission',
      description: 'Membuat pengajuan surat baru. Hanya untuk role MAHASISWA atau DOSEN',
      tags: ['Submission'],
    },
  })

  .put('/:id', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    return submissionController.updateSubmission(params.id, user.id, body);
  }, {
    params: submissionIdParamSchema,
    body: updateSubmissionSchema,
    detail: {
      summary: 'Update submission',
      description: 'Mengubah data pengajuan (revisi). Hanya bisa dilakukan oleh pemilik dan saat status masih memungkinkan',
      tags: ['Submission'],
    },
  })

  .post('/:id/cancel', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    return submissionController.cancelSubmission(params.id, user.id, body);
  }, {
    params: submissionIdParamSchema,
    body: cancelSubmissionSchema,
    detail: {
      summary: 'Cancel submission',
      description: 'Membatalkan pengajuan surat. Hanya bisa dilakukan oleh pemilik sebelum masuk proses fakultas',
      tags: ['Submission'],
    },
  })

  // ==========================================================================
  // Attachments
  // ==========================================================================

  .post('/:id/attachments', async ({ params, body, store }) => {
    const user = (store as AuthStore).user;
    // Note: File upload should be handled by separate endpoint with multipart
    // This is for registering uploaded file metadata
    return submissionController.addAttachment(
      params.id,
      user.id,
      {
        fileName: (body as any).fileName,
        fileUrl: (body as any).fileUrl,
        fileSize: (body as any).fileSize,
        mimeType: (body as any).mimeType,
      },
      (body as any).description
    );
  }, {
    params: submissionIdParamSchema,
    detail: {
      summary: 'Add attachment',
      description: 'Menambahkan lampiran ke pengajuan. File harus diupload terlebih dahulu ke storage',
      tags: ['Submission'],
    },
  })

  .delete('/:id/attachments/:attachmentId', async ({ params, store }) => {
    const user = (store as AuthStore).user;
    return submissionController.removeAttachment(params.id, params.attachmentId, user.id);
  }, {
    detail: {
      summary: 'Remove attachment',
      description: 'Menghapus lampiran dari pengajuan',
      tags: ['Submission'],
    },
  });
