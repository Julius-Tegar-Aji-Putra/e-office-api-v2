/**
 * Department Approval Controller
 * HTTP handler untuk modul department approval (approval & signing di lingkup departemen)
 */

import { departmentApprovalService, ApproveInput, RejectInput, SaveDraftInput, SignInput } from './department-approval.service';
import { successResponse, errorResponse } from '../../shared/utils/response';
import { DepartmentApprovalListParams } from './department-approval.repository';

// Helper to extract error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Terjadi kesalahan';
}

// ============================================================================
// CONTROLLER CLASS
// ============================================================================

class DepartmentApprovalController {
  /**
   * GET /department-approval/kaprodi-queue
   * Get letters pending Kaprodi approval
   */
  async getKaprodiQueue(userId: string, params: DepartmentApprovalListParams) {
    try {
      const result = await departmentApprovalService.getKaprodiQueue(userId, params);
      return successResponse('Berhasil mengambil daftar surat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * GET /department-approval/admin-queue
   * Get letters pending Admin Prodi drafting
   */
  async getAdminProdiQueue(userId: string, params: DepartmentApprovalListParams) {
    try {
      const result = await departmentApprovalService.getAdminProdiQueue(userId, params);
      return successResponse('Berhasil mengambil daftar surat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * GET /department-approval/signature-queue
   * Get letters pending signature
   */
  async getSignatureQueue(userId: string, role: string, params: DepartmentApprovalListParams) {
    try {
      const result = await departmentApprovalService.getSignatureQueue(userId, role, params);
      return successResponse('Berhasil mengambil daftar surat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * GET /department-approval/:id
   * Get letter detail
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    try {
      const result = await departmentApprovalService.getLetterDetail(letterId, userId, userRoles);
      return successResponse('Berhasil mengambil detail surat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /department-approval/:id/approve
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
      const result = await departmentApprovalService.approveSubmission(input, userId, userRole);
      return successResponse('Surat berhasil disetujui', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /department-approval/:id/reject
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
      const result = await departmentApprovalService.rejectSubmission(input, userId, userRole);
      return successResponse('Surat berhasil ditolak', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /department-approval/:id/create-draft
   * Admin Prodi creates initial draft (first time)
   */
  async createInitialDraft(letterId: string, userId: string, userRole: string) {
    try {
      const result = await departmentApprovalService.createInitialDraft(letterId, userId, userRole);
      return successResponse('Surat pengantar berhasil dibuat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /department-approval/:id/draft
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
      const result = await departmentApprovalService.saveDraft(input, userId, userRole);
      return successResponse('Draft berhasil disimpan', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /department-approval/:id/submit-draft
   * Admin Prodi submits draft for signature
   */
  async submitDraftForSignature(letterId: string, userId: string, userRole: string) {
    try {
      const result = await departmentApprovalService.submitForSignature(letterId, userId, userRole);
      return successResponse('Draft berhasil diajukan untuk ditandatangani', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /department-approval/:id/sign
   * Kaprodi/Kadep signs the document with new signature format
   */
  async signPengantar(
    letterId: string,
    body: {
      signatureData?: string; // base64 dari handwriting/upload
      signatureUrl?: string;  // URL dari saved signature
      saveSignature?: boolean;
      signerName?: string;
      signerNip?: string;
    },
    userId: string,
    userRole: string
  ) {
    try {
      const input: SignInput = {
        letterId,
        signatureData: body.signatureData,
        signatureUrl: body.signatureUrl,
        saveSignature: body.saveSignature,
        signerName: body.signerName,
        signerNip: body.signerNip
      };
      const result = await departmentApprovalService.signPengantar(input, userId, userRole);
      return successResponse('Surat berhasil ditandatangani', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * Helper method to get letter info for determining signer role
   * Used by route to properly determine which role the user should use
   */
  async getLetterForSigning(letterId: string) {
    try {
      return await departmentApprovalService.getLetterForSigning(letterId);
    } catch (error) {
      return null;
    }
  }
}

export const departmentApprovalController = new DepartmentApprovalController();
