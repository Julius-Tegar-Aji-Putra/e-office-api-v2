/**
 * Submission Controller
 * HTTP handlers untuk modul pengajuan surat
 * Mengikuti flow dari Prompting.md Modul A: SUBMISSION
 */

import { submissionService, SubmissionService } from './submission.service';
import { successResponse, errorResponse, paginatedResponse } from '../../shared/utils/response';
import { HTTP_STATUS } from '../../shared/constants/http-status';
import { ROLES } from '../../shared/constants/roles';
import type { CreateSubmissionDTO, SubmissionFilter, SubmissionSort } from './submission.types';
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
   */
  async getSubmissionById(id: string, userId: string, userRoles: string[]) {
    try {
      // Determine viewer role for display status
      const viewerRole = this.getPrimaryRole(userRoles);
      
      const submission = await this.service.getSubmissionById(id, viewerRole);
      if (!submission) {
        return errorResponse('Pengajuan tidak ditemukan', HTTP_STATUS.NOT_FOUND);
      }

      // Check access - submitter can only see their own
      if (
        (viewerRole === ROLES.MAHASISWA || viewerRole === ROLES.DOSEN) &&
        submission.createdBy.id !== userId
      ) {
        return errorResponse('Anda tidak memiliki akses ke pengajuan ini', HTTP_STATUS.FORBIDDEN);
      }

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
   * Create new submission
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
   * Add attachment
   */
  async addAttachment(
    letterInstanceId: string,
    userId: string,
    file: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string },
    description?: string
  ) {
    try {
      const attachment = await this.service.addAttachment(
        letterInstanceId,
        userId,
        file,
        description
      );
      return successResponse('Lampiran berhasil ditambahkan', attachment);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal menambahkan lampiran',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  /**
   * DELETE /submission/:id/attachments/:attachmentId
   * Remove attachment
   */
  async removeAttachment(letterInstanceId: string, attachmentId: string, userId: string) {
    try {
      const result = await this.service.removeAttachment(attachmentId, letterInstanceId, userId);
      return successResponse(result.message);
    } catch (error) {
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal menghapus lampiran',
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
