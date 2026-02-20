/**
 * Submission Routes (Elysia)
 * Route definition untuk modul pengajuan surat
 * Path prefix: /api/submission
 */

import { Elysia, t } from 'elysia';
import { submissionController } from './submission.controller';
import {
  createSubmissionSchema,
  updateSubmissionSchema,
  submissionQuerySchema,
  submissionIdParamSchema,
  cancelSubmissionSchema,
  createSubmissionWithFilesSchema,
  uploadAttachmentSchema,
} from './submission.validation';
import { authGuardPlugin } from '../../middlewares/auth';
import { getUserRoles } from '../../lib/casbin';

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
  .use(authGuardPlugin)

  .get('/', async ({ query, user }) => {
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

  .get('/:id', async ({ params, user }) => {
    // Get user roles from Casbin
    const userRoles = await getUserRoles(user.id);
    return submissionController.getSubmissionById(params.id, user.id, userRoles);
  }, {
    params: submissionIdParamSchema,
    detail: {
      summary: 'Get submission by ID',
      description: 'Mendapatkan detail pengajuan surat beserta dokumen, lampiran, dan riwayat',
      tags: ['Submission'],
    },
  })

  .post('/', async ({ body, user }) => {
    return submissionController.createSubmission(user.id, {
      ...body,
      formData: {
        ...body.formData,
        judulAcara: body.formData.judulAcara ?? '',
        lokasiAcara: body.formData.lokasiAcara ?? '',
      },
    });
  }, {
    body: createSubmissionSchema,
    detail: {
      summary: 'Create new submission',
      description: 'Membuat pengajuan surat baru tanpa lampiran. Hanya untuk role MAHASISWA atau DOSEN',
      tags: ['Submission'],
    },
  })

  // Route untuk create submission dengan file upload
  .post('/with-files', async ({ body, user }) => {
    // Extract files from multipart form-data (field name is 'attachments')
    const files = body.attachments
      ? (Array.isArray(body.attachments) ? body.attachments : [body.attachments]).filter((f: unknown): f is File => f instanceof File)
      : null;

    return submissionController.createSubmissionWithFiles(
      user.id,
      {
        letterTypeId: body.letterTypeId,
        nama: body.nama,
        nim: body.nim,
        nip: body.nip,
        departemen: body.departemen,
        programStudi: body.programStudi,
        jenisSurat: body.jenisSurat,
        keperluan: body.keperluan,
        judulAcara: body.judulAcara ?? '',
        tanggalAcara: body.tanggalAcara,
        durasiAcara: body.durasiAcara,
        lokasiAcara: body.lokasiAcara ?? '',
        butuhTtdKadep: body.butuhTtdKadep,
        targetSigner: body.targetSigner,
        requestKadepSign: body.requestKadepSign,
      },
      files
    );
  }, {
    body: createSubmissionWithFilesSchema,
    detail: {
      summary: 'Create new submission with files',
      description: 'Membuat pengajuan surat baru dengan upload lampiran langsung (multipart/form-data). Max 5 files, masing-masing max 5MB. Format: PDF, JPG, PNG',
      tags: ['Submission'],
    },
  })

  .put('/:id', async ({ params, body, user }) => {
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

  .post('/:id/cancel', async ({ params, body, user }) => {
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

  // Upload attachment (multipart/form-data)
  .post('/:id/attachments', async ({ params, body, user }) => {
    // Validate file exists
    if (!body.file || !(body.file instanceof File)) {
      return {
        success: false,
        message: 'File lampiran wajib diunggah',
        statusCode: 400,
      };
    }

    return submissionController.addAttachment(
      params.id,
      user.id,
      body.file,
      body.description
    );
  }, {
    params: submissionIdParamSchema,
    body: uploadAttachmentSchema,
    detail: {
      summary: 'Upload attachment',
      description: 'Mengunggah dan menambahkan lampiran ke pengajuan (multipart/form-data). Max 5MB, format: PDF, JPG, PNG',
      tags: ['Submission'],
    },
  })

  // Get attachment download URL
  .get('/:id/attachments/:attachmentId/download', async ({ params, user }) => {
    return submissionController.getAttachmentDownloadUrl(
      params.id,
      params.attachmentId,
      user.id,
      []
    );
  }, {
    params: t.Object({
      id: t.String({ description: 'Letter Instance ID' }),
      attachmentId: t.String({ description: 'Attachment ID' }),
    }),
    detail: {
      summary: 'Get attachment download URL',
      description: 'Mendapatkan signed URL untuk download lampiran (valid 1 jam)',
      tags: ['Submission'],
    },
  })

  // Stream attachment file directly (proxy through backend)
  .get('/:id/attachments/:attachmentId/stream', async ({ params, user, set }) => {
    return submissionController.streamAttachment(
      params.id,
      params.attachmentId,
      user.id,
      [],
      { headers: set.headers as Record<string, string>, status: set.status as number | undefined }
    );
  }, {
    params: t.Object({
      id: t.String({ description: 'Letter Instance ID' }),
      attachmentId: t.String({ description: 'Attachment ID' }),
    }),
    detail: {
      summary: 'Stream attachment file',
      description: 'Download file langsung melalui backend (bypass CORS)',
      tags: ['Submission'],
    },
  })

  // Delete attachment
  .delete('/:id/attachments/:attachmentId', async ({ params, user }) => {
    return submissionController.removeAttachment(params.id, params.attachmentId, user.id);
  }, {
    params: t.Object({
      id: t.String({ description: 'Letter Instance ID' }),
      attachmentId: t.String({ description: 'Attachment ID' }),
    }),
    detail: {
      summary: 'Remove attachment',
      description: 'Menghapus lampiran dari pengajuan dan storage',
      tags: ['Submission'],
    },
  });
