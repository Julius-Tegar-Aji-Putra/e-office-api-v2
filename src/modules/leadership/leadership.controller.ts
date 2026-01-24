/**
 * Leadership Controller
 * HTTP handler untuk modul verifikasi & tanda tangan
 */

import { leadershipService } from './leadership.service';
import { LeadershipListParams } from './leadership.repository';
import { successResponse, errorResponse } from '../../shared/utils/response';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';

// ============================================================================
// CONTROLLER CLASS
// ============================================================================

class LeadershipController {
  /**
   * GET /leadership/queue
   * Get verification/signing queue
   */
  async getVerificationQueue(userRole: string, params: LeadershipListParams) {
    try {
      const result = await leadershipService.getVerificationQueue(userRole, params);
      return successResponse('Berhasil mengambil antrian verifikasi', result);
    } catch (error: unknown) {
      const err = error as AppError;
      return errorResponse(err.message || 'Terjadi kesalahan', err.statusCode || HTTP_STATUS.INTERNAL_ERROR);
    }
  }

  /**
   * GET /leadership/:id
   * Get letter detail with verification context
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    try {
      const result = await leadershipService.getLetterDetail(letterId, userId, userRoles);
      return successResponse('Berhasil mengambil detail surat', result);
    } catch (error: unknown) {
      const err = error as AppError;
      return errorResponse(err.message || 'Terjadi kesalahan', err.statusCode || HTTP_STATUS.INTERNAL_ERROR);
    }
  }

  /**
   * POST /leadership/:id/verify
   * Verify document and forward
   */
  async verifyDocument(
    letterId: string,
    body: { notes?: string; nextTargets?: string[] },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await leadershipService.verifyDocument(
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
   * POST /leadership/:id/sign
   * Sign document
   */
  async signDocument(
    letterId: string,
    body: {
      signatureUrl: string;
      signerName: string;
      signerNip?: string;
      notes?: string;
    },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await leadershipService.signDocument(
        {
          letterId,
          signatureUrl: body.signatureUrl,
          signerName: body.signerName,
          signerNip: body.signerNip,
          notes: body.notes
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
   * POST /leadership/:id/return
   * Return document to lower role
   */
  async returnDocument(
    letterId: string,
    body: { targetRole: string; reason: string },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await leadershipService.returnDocument(
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
   * PUT /leadership/document/:documentId
   * Update draft (Supervisor only)
   */
  async updateDraft(
    documentId: string,
    body: { content: Record<string, unknown> },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await leadershipService.updateDraft(
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

export const leadershipController = new LeadershipController();
