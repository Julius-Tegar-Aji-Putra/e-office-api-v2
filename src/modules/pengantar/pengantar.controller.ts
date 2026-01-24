/**
 * Pengantar Controller
 * HTTP handler untuk modul surat pengantar
 */

import { pengantarService, ApproveInput, RejectInput, SaveDraftInput, SignInput } from './pengantar.service';
import { successResponse, errorResponse } from '../../shared/utils/response';
import { PengantarListParams } from './pengantar.repository';

// Helper to extract error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Terjadi kesalahan';
}

// ============================================================================
// CONTROLLER CLASS
// ============================================================================

class PengantarController {
  /**
   * GET /pengantar/kaprodi-queue
   * Get letters pending Kaprodi approval
   */
  async getKaprodiQueue(userId: string, params: PengantarListParams) {
    try {
      const result = await pengantarService.getKaprodiQueue(userId, params);
      return successResponse('Berhasil mengambil daftar surat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * GET /pengantar/admin-queue
   * Get letters pending Admin Prodi drafting
   */
  async getAdminProdiQueue(userId: string, params: PengantarListParams) {
    try {
      const result = await pengantarService.getAdminProdiQueue(userId, params);
      return successResponse('Berhasil mengambil daftar surat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * GET /pengantar/signature-queue
   * Get letters pending signature
   */
  async getSignatureQueue(userId: string, role: string, params: PengantarListParams) {
    try {
      const result = await pengantarService.getSignatureQueue(userId, role, params);
      return successResponse('Berhasil mengambil daftar surat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * GET /pengantar/:id
   * Get letter detail
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    try {
      const result = await pengantarService.getLetterDetail(letterId, userId, userRoles);
      return successResponse('Berhasil mengambil detail surat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /pengantar/:id/approve
   * Kaprodi approves submission
   */
  async approveSubmission(
    letterId: string,
    body: { notes?: string },
    userId: string,
    userRole: string
  ) {
    try {
      const input: ApproveInput = {
        letterId,
        notes: body.notes
      };
      const result = await pengantarService.approveSubmission(input, userId, userRole);
      return successResponse('Surat berhasil disetujui', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /pengantar/:id/reject
   * Kaprodi rejects submission
   */
  async rejectSubmission(
    letterId: string,
    body: { reason: string },
    userId: string,
    userRole: string
  ) {
    try {
      const input: RejectInput = {
        letterId,
        reason: body.reason
      };
      const result = await pengantarService.rejectSubmission(input, userId, userRole);
      return successResponse('Surat berhasil ditolak', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /pengantar/:id/draft
   * Admin Prodi saves draft
   */
  async saveDraft(
    letterId: string,
    body: {
      content: Record<string, unknown>;
      tembusan?: string[];
      signatories: Array<{
        signerRole: string;
        signerName: string;
        signerNip?: string;
        order: number;
      }>;
    },
    userId: string,
    userRole: string
  ) {
    try {
      const input: SaveDraftInput = {
        letterId,
        content: body.content,
        tembusan: body.tembusan,
        signatories: body.signatories
      };
      const result = await pengantarService.saveDraft(input, userId, userRole);
      return successResponse('Draft berhasil disimpan', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /pengantar/:id/submit-draft
   * Admin Prodi submits draft for signature
   */
  async submitDraftForSignature(letterId: string, userId: string, userRole: string) {
    try {
      const result = await pengantarService.submitForSignature(letterId, userId, userRole);
      return successResponse('Draft berhasil diajukan untuk ditandatangani', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /pengantar/:id/sign
   * Kaprodi/Kadep signs the document
   */
  async signPengantar(
    letterId: string,
    body: {
      signatureUrl: string;
      signerName: string;
      signerNip?: string;
    },
    userId: string,
    userRole: string
  ) {
    try {
      const input: SignInput = {
        letterId,
        signatureUrl: body.signatureUrl,
        signerName: body.signerName,
        signerNip: body.signerNip
      };
      const result = await pengantarService.signPengantar(input, userId, userRole);
      return successResponse('Surat berhasil ditandatangani', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }
}

export const pengantarController = new PengantarController();
