/**
 * Submission Controller
 * HTTP handlers untuk modul pengajuan surat
 * Mengikuti flow dari Prompting.md Modul A: SUBMISSION
 */

import { submissionService, SubmissionService } from './submission.service';
import { successResponse, errorResponse, paginatedResponse } from '../../shared/utils/response';
import { HTTP_STATUS } from '../../shared/constants/http-status';
import { ROLES } from '../../shared/constants/roles';
import { validateFiles, FILE_UPLOAD_CONFIG } from './submission.validation';
import type { CreateSubmissionDTO, SubmissionFilter, SubmissionSort, CreateSubmissionMultipartData, SignatureConfigDTO } from './submission.types';
import type { LetterCategory } from '../../generated/prisma/enums';

// ============================================================================
// Controller Class
// ============================================================================

export class SubmissionController {
  constructor(private service: SubmissionService = submissionService) {}

  // ==========================================================================
  // Letter Types
  // ==========================================================================

  /**
   * GET /submission/letter-types
   * Get all available letter types for submission form
   */
  async getLetterTypes() {
    try {
      const types = await this.service.getLetterTypes();
      return successResponse('Berhasil mengambil jenis surat', types);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal mengambil jenis surat',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * GET /submission/letter-types/:id
   * Get letter type detail with form schema
   */
  async getLetterTypeById(id: string) {
    try {
      const type = await this.service.getLetterTypeById(id);
      if (!type) {
        return errorResponse('Jenis surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
      }
      return successResponse('Berhasil mengambil detail jenis surat', type);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal mengambil detail jenis surat',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  // ==========================================================================
  // Submissions CRUD
  // ==========================================================================

  /**
   * GET /submission
   * Get my submissions (untuk Mahasiswa/Dosen)
   * Query params: page, limit, status, letterTypeId, category, search, dateFrom, dateTo, sortBy, sortOrder
   */
  async getMySubmissions(
    userId: string,
    query: {
      page?: number;
      limit?: number;
      status?: string;
      letterTypeId?: string;
      category?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortOrder?: string;
    }
  ) {
    try {
      const filter: SubmissionFilter = {
        ...(query.status && { status: query.status as any }),
        ...(query.letterTypeId && { letterTypeId: query.letterTypeId }),
        ...(query.category && { category: query.category as LetterCategory }),
        ...(query.search && { search: query.search }),
        ...(query.dateFrom && { dateFrom: new Date(query.dateFrom) }),
        ...(query.dateTo && { dateTo: new Date(query.dateTo) }),
      };

      const sort: SubmissionSort = {
        field: (query.sortBy as any) || 'submittedAt',
        order: (query.sortOrder as any) || 'desc',
      };

      const pagination = {
        page: query.page || 1,
        limit: query.limit || 10,
      };

      const result = await this.service.getMySubmissions(userId, filter, sort, pagination);

      return paginatedResponse(
        'Berhasil mengambil daftar pengajuan',
        result.data,
        result.meta
      );
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal mengambil daftar pengajuan',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * GET /submission/:id
   * Get submission detail
   * Access Rules:
   * - MAHASISWA/DOSEN: hanya bisa lihat milik sendiri
   * - KAPRODI: bisa lihat pengajuan dari prodi-nya yang statusnya >= SUBMITTED
   * - ADMIN_PRODI: bisa lihat pengajuan dari prodi-nya
   * - KADEP: bisa lihat pengajuan dari departemen-nya
   * - Faculty roles: bisa lihat semua yang sudah masuk fakultas
   */
  async getSubmissionById(id: string, userId: string, userRoles: string[]) {
    try {
      // Determine viewer role for display status
      const viewerRole = this.getPrimaryRole(userRoles);
      
      const submission = await this.service.getSubmissionById(id, viewerRole);
      if (!submission) {
        return errorResponse('Pengajuan tidak ditemukan', HTTP_STATUS.NOT_FOUND);
      }

      // Check access based on role
      const isOwnSubmission = submission.createdBy.id === userId;
      
      // Submitter (MAHASISWA/DOSEN) can only see their own
      if (viewerRole === ROLES.MAHASISWA || viewerRole === ROLES.DOSEN) {
        if (!isOwnSubmission) {
          return errorResponse('Anda tidak memiliki akses ke pengajuan ini', HTTP_STATUS.FORBIDDEN);
        }
      }
      
      // For other roles, they have access via dashboard so we trust they can view
      // TODO: Add more granular checks based on departemen/prodi if needed

      return successResponse('Berhasil mengambil detail pengajuan', submission);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal mengambil detail pengajuan',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * POST /submission
   * Create new submission (tanpa lampiran)
   */
  async createSubmission(userId: string, body: CreateSubmissionDTO) {
    try {
      const result = await this.service.createSubmission(userId, body);
      return successResponse('Pengajuan berhasil dibuat', result);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal membuat pengajuan',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  /**
   * POST /submission/with-files
   * Create new submission dengan upload lampiran
   * Menerima multipart form-data dengan files
   */
  async createSubmissionWithFiles(
    userId: string,
    formData: CreateSubmissionMultipartData,
    files: File[] | null
  ) {
    try {
      // Validasi files jika ada
      if (files && files.length > 0) {
        const fileValidation = validateFiles(files);
        if (!fileValidation.valid) {
          return errorResponse(
            fileValidation.errors.join(', '),
            HTTP_STATUS.BAD_REQUEST
          );
        }
      }

      // Parse boolean values from string (multipart form-data sends everything as string)
      const parseBool = (val: boolean | string | undefined): boolean => {
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') return val.toLowerCase() === 'true';
        return false;
      };

      // Construct CreateSubmissionDTO from flat multipart data
      const dto: CreateSubmissionDTO = {
        letterTypeId: formData.letterTypeId,
        formData: {
          nama: formData.nama,
          nim: formData.nim,
          nip: formData.nip,
          departemen: formData.departemen,
          programStudi: formData.programStudi,
          jenisSurat: formData.jenisSurat,
          keperluan: formData.keperluan,
          judulAcara: formData.judulAcara,
          tanggalAcara: formData.tanggalAcara,
          durasiAcara: formData.durasiAcara,
          lokasiAcara: formData.lokasiAcara,
          butuhTtdKadep: parseBool(formData.butuhTtdKadep),
        },
        signatureConfig: {
          targetSigner: formData.targetSigner,
          requestKadepSign: parseBool(formData.requestKadepSign),
        },
      };

      const result = await this.service.createSubmission(userId, dto, files || undefined);
      return successResponse('Pengajuan berhasil dibuat', result);
    } catch (error) {
      console.error('Error creating submission with files:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal membuat pengajuan',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  /**
   * PUT /submission/:id
   * Update submission (revisi)
   */
  async updateSubmission(
    id: string,
    userId: string,
    body: {
      formData?: Partial<any>;
      signatureConfig?: Partial<any>;
    }
  ) {
    try {
      const result = await this.service.updateSubmission(
        id,
        userId,
        body.formData || {},
        body.signatureConfig
      );
      return successResponse('Pengajuan berhasil diperbarui', result);
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('tidak dapat')
          ? HTTP_STATUS.BAD_REQUEST
          : error instanceof Error && error.message.includes('Unauthorized')
          ? HTTP_STATUS.FORBIDDEN
          : HTTP_STATUS.INTERNAL_SERVER_ERROR;

      return errorResponse(
        error instanceof Error ? error.message : 'Gagal memperbarui pengajuan',
        status
      );
    }
  }

  /**
   * POST /submission/:id/cancel
   * Cancel submission
   */
  async cancelSubmission(id: string, userId: string, body: { alasan?: string }) {
    try {
      const result = await this.service.cancelSubmission(id, userId, body.alasan);
      return successResponse('Pengajuan berhasil dibatalkan', result);
    } catch (error) {
      const status =
        error instanceof Error && error.message.includes('tidak dapat')
          ? HTTP_STATUS.BAD_REQUEST
          : error instanceof Error && error.message.includes('Unauthorized')
          ? HTTP_STATUS.FORBIDDEN
          : HTTP_STATUS.INTERNAL_SERVER_ERROR;

      return errorResponse(
        error instanceof Error ? error.message : 'Gagal membatalkan pengajuan',
        status
      );
    }
  }

  // ==========================================================================
  // Attachments
  // ==========================================================================

  /**
   * POST /submission/:id/attachments
   * Upload dan tambah attachment ke submission
   * Menerima single file via multipart form-data
   */
  async addAttachment(
    letterInstanceId: string,
    userId: string,
    file: File,
    description?: string
  ) {
    try {
      // Validasi file
      const fileValidation = validateFiles([file]);
      if (!fileValidation.valid) {
        return errorResponse(
          fileValidation.errors.join(', '),
          HTTP_STATUS.BAD_REQUEST
        );
      }

      const attachment = await this.service.addAttachment(
        letterInstanceId,
        userId,
        file,
        description
      );
      return successResponse('Lampiran berhasil ditambahkan', attachment);
    } catch (error) {
      console.error('Error adding attachment:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal menambahkan lampiran',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  /**
   * DELETE /submission/:id/attachments/:attachmentId
   * Remove attachment dari submission dan MinIO storage
   */
  async removeAttachment(letterInstanceId: string, attachmentId: string, userId: string) {
    try {
      const result = await this.service.removeAttachment(attachmentId, letterInstanceId, userId);
      return successResponse(result.message);
    } catch (error) {
      console.error('Error removing attachment:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal menghapus lampiran',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  /**
   * GET /submission/:id/attachments/:attachmentId/download
   * Get signed URL untuk download attachment
   */
  async getAttachmentDownloadUrl(
    letterInstanceId: string,
    attachmentId: string,
    userId: string,
    userRoles: string[]
  ) {
    try {
      // Verify access to submission first
      const viewerRole = this.getPrimaryRole(userRoles);
      const submission = await this.service.getSubmissionById(letterInstanceId, viewerRole);
      
      if (!submission) {
        return errorResponse('Pengajuan tidak ditemukan', HTTP_STATUS.NOT_FOUND);
      }

      // Check access - submitter can only access their own
      if (
        (viewerRole === ROLES.MAHASISWA || viewerRole === ROLES.DOSEN) &&
        submission.createdBy.id !== userId
      ) {
        return errorResponse('Anda tidak memiliki akses ke lampiran ini', HTTP_STATUS.FORBIDDEN);
      }

      const result = await this.service.getAttachmentUrl(attachmentId, letterInstanceId, userId);
      return successResponse('URL download berhasil dibuat', result);
    } catch (error) {
      console.error('Error getting attachment URL:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal mendapatkan URL download',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Get primary role from user roles array
   */
  private getPrimaryRole(roles: string[]): string {
    // Priority: Faculty roles > Prodi roles > Student/Dosen
    const priorityOrder = [
      ROLES.SUPERADMIN,
      ROLES.DEKAN,
      ROLES.WAKIL_DEKAN_1,
      ROLES.WAKIL_DEKAN_2,
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.STAF_AKADEMIK,
      ROLES.STAF_SUMBER_DAYA,
      ROLES.ADMIN_FAKULTAS,
      ROLES.UPA,
      ROLES.KETUA_DEPARTEMEN,
      ROLES.KETUA_PRODI,
      ROLES.ADMIN_PRODI,
      ROLES.DOSEN,
      ROLES.MAHASISWA,
    ];

    for (const role of priorityOrder) {
      if (roles.includes(role)) {
        return role;
      }
    }

    return roles[0] || ROLES.MAHASISWA;
  }
}

// Singleton instance
export const submissionController = new SubmissionController();
