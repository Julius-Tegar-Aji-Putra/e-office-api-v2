/**
 * Faculty Approval Controller
 * HTTP handler untuk modul verifikasi & tanda tangan pejabat fakultas
 */

import { facultyApprovalService } from './faculty-approval.service';
import { FacultyApprovalListParams } from './faculty-approval.repository';
import { successResponse, errorResponse } from '../../shared/utils/response';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';

// ============================================================================
// CONTROLLER CLASS
// ============================================================================

class FacultyApprovalController {
  /**
   * GET /faculty-approval/queue
   * Get verification/signing queue
   */
  async getVerificationQueue(userRole: string, params: FacultyApprovalListParams) {
    try {
      const result = await facultyApprovalService.getVerificationQueue(userRole, params);
      return successResponse('Berhasil mengambil antrian verifikasi', result);
    } catch (error: unknown) {
      const err = error as AppError;
      return errorResponse(err.message || 'Terjadi kesalahan', err.statusCode || HTTP_STATUS.INTERNAL_ERROR);
    }
  }

  /**
   * GET /faculty-approval/:id
   * Get letter detail with verification context
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    try {
      const result = await facultyApprovalService.getLetterDetail(letterId, userId, userRoles);
      return successResponse('Berhasil mengambil detail surat', result);
    } catch (error: unknown) {
      const err = error as AppError;
      return errorResponse(err.message || 'Terjadi kesalahan', err.statusCode || HTTP_STATUS.INTERNAL_ERROR);
    }
  }

  /**
   * POST /faculty-approval/:id/verify
   * Verify document and forward
   */
  async verifyDocument(
    letterId: string,
    body: { notes?: string; nextTargets?: string[] },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await facultyApprovalService.verifyDocument(
        { letterId, notes: body.notes, nextTargets: body.nextTargets },
        userId,
        userRole
      );
      return successResponse('Dokumen berhasil diverifikasi', result);
    } catch (error: unknown) {
      const err = error as AppError;
      return errorResponse(err.message || 'Terjadi kesalahan', err.statusCode || HTTP_STATUS.INTERNAL_ERROR);
    }
  }

  /**
   * POST /faculty-approval/:id/sign
   * Sign document
   */
  async signDocument(
    letterId: string,
    body: {
      signatureData?: string;
      signatureUrl?: string;
      signerName?: string;
      signerNip?: string;
      notes?: string;
      saveSignature?: boolean;
    },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await facultyApprovalService.signDocument(
        {
          letterId,
          signatureData: body.signatureData,
          signatureUrl: body.signatureUrl,
          signerName: body.signerName,
          signerNip: body.signerNip,
          notes: body.notes,
          saveSignature: body.saveSignature
        },
        userId,
        userRole
      );
      return successResponse('Dokumen berhasil ditandatangani', result);
    } catch (error: unknown) {
      const err = error as AppError;
      return errorResponse(err.message || 'Terjadi kesalahan', err.statusCode || HTTP_STATUS.INTERNAL_ERROR);
    }
  }

  /**
   * POST /faculty-approval/:id/return
   * Return document to lower role
   */
  async returnDocument(
    letterId: string,
    body: { targetRole: string; reason: string },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await facultyApprovalService.returnDocument(
        { letterId, targetRole: body.targetRole, reason: body.reason },
        userId,
        userRole
      );
      return successResponse('Dokumen berhasil dikembalikan', result);
    } catch (error: unknown) {
      const err = error as AppError;
      return errorResponse(err.message || 'Terjadi kesalahan', err.statusCode || HTTP_STATUS.INTERNAL_ERROR);
    }
  }

  /**
   * PUT /faculty-approval/document/:documentId
   * Update draft (Supervisor only)
   */
  async updateDraft(
    documentId: string,
    body: { content: Record<string, unknown> },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await facultyApprovalService.updateDraft(
        documentId,
        body.content,
        userId,
        userRole
      );
      return successResponse('Draft berhasil diperbarui', result);
    } catch (error: unknown) {
      const err = error as AppError;
      return errorResponse(err.message || 'Terjadi kesalahan', err.statusCode || HTTP_STATUS.INTERNAL_ERROR);
    }
  }
}

export const facultyApprovalController = new FacultyApprovalController();
