/**
 * Surat Hasil Controller
 * HTTP handler untuk modul drafting SK/ST
 */

import { hasilService, CreateDraftServiceInput, UpdateDraftServiceInput } from './hasil.service';
import { HasilListParams } from './hasil.repository';
import { successResponse, errorResponse } from '../../shared/utils/response';

// Helper to extract error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Terjadi kesalahan';
}

// ============================================================================
// CONTROLLER CLASS
// ============================================================================

class HasilController {
  /**
   * GET /surat-hasil/queue
   * Get drafting queue for staff
   */
  async getDraftingQueue(userId: string, userRoles: string[], params: HasilListParams) {
    try {
      const result = await hasilService.getDraftingQueue(userId, userRoles, params);
      return successResponse('Berhasil mengambil antrian drafting', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * GET /surat-hasil/my-drafts
   * Get letters drafted by current user
   */
  async getMyDraftedLetters(userId: string, params: HasilListParams) {
    try {
      const result = await hasilService.getMyDraftedLetters(userId, params);
      return successResponse('Berhasil mengambil daftar draft', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * GET /surat-hasil/:id
   * Get letter detail for drafting
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    try {
      const result = await hasilService.getLetterDetail(letterId, userId, userRoles);
      return successResponse('Berhasil mengambil detail surat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /surat-hasil/:id/draft
   * Create new SK/ST/SP draft
   */
  async createDraft(
    letterId: string,
    body: {
      documentType: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN' | 'SURAT_PENGANTAR' | 'SURAT_TUGAS_TABEL';
      content: Record<string, unknown>;
      tembusan?: string[];
      perihal?: string;
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
      const input: CreateDraftServiceInput = {
        letterId,
        documentType: body.documentType,
        content: body.content,
        tembusan: body.tembusan,
        perihal: body.perihal,
        signatories: body.signatories
      };
      const result = await hasilService.createDraft(input, userId, userRole);
      return successResponse('Draft berhasil dibuat', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * PUT /surat-hasil/document/:documentId
   * Update existing draft
   * Supports mode: "patch" (default) or "overwrite"
   */
  async updateDraft(
    documentId: string,
    body: {
      content?: Record<string, unknown>;
      tembusan?: string[];
      perihal?: string;
      mode?: 'patch' | 'overwrite';
      signatories?: Array<{
        signerRole: string;
        signerName: string;
        signerNip?: string;
        order: number;
        x?: number;
        y?: number;
        page?: number;
      }>;
    },
    userId: string,
    userRole: string
  ) {
    try {
      const input: UpdateDraftServiceInput = {
        documentId,
        content: body.content,
        tembusan: body.tembusan,
        perihal: body.perihal,
        mode: body.mode,
        signatories: body.signatories
      };
      const result = await hasilService.updateDraft(input, userId, userRole);
      return successResponse(
        body.mode === 'overwrite' ? 'Draft berhasil dibuat ulang' : 'Draft berhasil diperbarui', 
        result
      );
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /surat-hasil/:id/submit
   * Submit draft for verification
   */
  async submitForVerification(
    letterId: string,
    body: { targetSupervisor?: 'SUPERVISOR_AKADEMIK' | 'SUPERVISOR_SUMBER_DAYA' },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await hasilService.submitForVerification(
        letterId,
        userId,
        userRole,
        body.targetSupervisor
      );
      return successResponse('Draft berhasil diajukan untuk verifikasi', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /surat-hasil/:id/approve
   * Supervisor/Manajer TU approves verification
   * - Supervisor approve -> ke Manajer TU
   * - Manajer TU approve -> ke Signing
   */
  async approveVerification(
    letterId: string,
    body: { notes?: string },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await hasilService.approveVerification(
        letterId,
        userId,
        userRole,
        body.notes
      );
      
      // Supervisor -> Manajer TU
      if (userRole.includes('SUPERVISOR')) {
        return successResponse('Draft berhasil diverifikasi, diteruskan ke Manajer TU', { letter: result });
      }
      
      // Manajer TU -> Signing
      return successResponse('Draft berhasil diverifikasi, siap untuk ditandatangani', { letter: result });
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * PUT /surat-hasil/:id/supervisor-edit
   * Supervisor/Manajer TU edits draft (opsi 2)
   * Pakai letterId, otomatis cari dokumen SK/ST-nya
   */
  async updateDraftAsSupervisor(
    letterId: string,
    body: {
      content?: Record<string, unknown>;
      tembusan?: string[];
      perihal?: string;
    },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await hasilService.updateDraftAsSupervisor(
        letterId,
        body.content,
        body.tembusan,
        body.perihal,
        userId,
        userRole
      );
      return successResponse('Draft berhasil diperbarui oleh Supervisor/Manajer TU', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /surat-hasil/:id/return
   * Supervisor returns draft for revision
   * @param targetStaff - Optional target staff for UMUM category letters
   */
  async returnForRevision(
    letterId: string,
    body: { reason: string; targetStaff?: string },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await hasilService.returnForRevision(
        letterId,
        userId,
        userRole,
        body.reason,
        body.targetStaff
      );
      return successResponse('Draft dikembalikan untuk revisi', { letter: result });
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /surat-hasil/:id/sign
   * Pejabat (Dekan/Wadek) signs SK/ST document
   * Supports:
   * - signatureData: base64 image from canvas/upload
   * - signatureUrl: URL to saved signature (legacy)
   * - saveSignature: save the signature to user's saved signatures
   */
  async signDocument(
    letterId: string,
    body: {
      signatureData?: string;
      signatureUrl?: string;
      signerName?: string;
      signerNip?: string;
      saveSignature?: boolean;
    },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await hasilService.signDocument(
        letterId,
        body.signatureData,
        body.signatureUrl,
        body.signerName,
        body.signerNip,
        body.saveSignature ?? false,
        userId,
        userRole
      );
      return successResponse('Dokumen berhasil ditandatangani', { letter: result });
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /surat-hasil/create
   * Staff creates new surat directly (without submission)
   * For STAF_AKADEMIK and STAF_SUMBER_DAYA
   */
  async createStaffSurat(
    body: {
      category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM';
      documentType: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN' | 'SURAT_TUGAS_TABEL';
      content: Record<string, unknown>;
      tembusan?: string[];
      perihal?: string;
      targetSupervisor?: 'SUPERVISOR_AKADEMIK' | 'SUPERVISOR_SUMBER_DAYA';
      signatories: Array<{
        signerRole: string;
        signerName: string;
        signerNip?: string;
        order: number;
        x?: number;
        y?: number;
        page?: number;
      }>;
    },
    userId: string,
    userRole: string
  ) {
    try {
      const result = await hasilService.createStaffSurat(
        {
          category: body.category,
          documentType: body.documentType,
          content: body.content,
          tembusan: body.tembusan,
          perihal: body.perihal,
          targetSupervisor: body.targetSupervisor,
          signatories: body.signatories
        },
        userId,
        userRole
      );
      return successResponse('Surat berhasil dibuat', {
        id: result.letterInstance.id,
        documentId: result.document.id
      });
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * POST /surat-hasil/document/:documentId/attachments
   * Upload attachments to document
   */
  async uploadAttachments(
    documentId: string,
    files: File[],
    userId: string,
    userRole: string
  ) {
    try {
      const result = await hasilService.uploadAttachments(documentId, files, userId, userRole);
      return successResponse('Lampiran berhasil diunggah', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * DELETE /surat-hasil/document/:documentId/attachments/:index
   * Remove attachment from document
   */
  async removeAttachment(
    documentId: string,
    attachmentIndex: number,
    userId: string,
    userRole: string
  ) {
    try {
      const result = await hasilService.removeAttachment(documentId, attachmentIndex, userId, userRole);
      return successResponse('Lampiran berhasil dihapus', result);
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }

  /**
   * GET /surat-hasil/document/:documentId/attachments
   * Get attachments for document
   */
  async getAttachments(documentId: string) {
    try {
      const attachmentUrls = await hasilService.getAttachments(documentId);
      return successResponse('Berhasil mengambil lampiran', { attachmentUrls });
    } catch (error: unknown) {
      return errorResponse(getErrorMessage(error));
    }
  }
}

export const hasilController = new HasilController();
