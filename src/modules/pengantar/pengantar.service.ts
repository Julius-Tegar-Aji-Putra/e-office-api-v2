/**
 * Pengantar Service
 * Business logic untuk modul surat pengantar (Lingkup Departemen)
 * Handles: Kaprodi approval, Admin Prodi drafting, TTD flow
 */

import { pengantarRepository, PengantarListParams, CreatePengantarDraftInput } from './pengantar.repository';
import { LetterStatus, Prisma } from '../../generated/prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';

// ============================================================================
// TYPES
// ============================================================================

export interface ApproveInput {
  letterId: string;
  notes?: string;
}

export interface RejectInput {
  letterId: string;
  reason: string;
}

export interface SaveDraftInput {
  letterId: string;
  content: Record<string, unknown>;
  tembusan?: string[];
  signatories: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string;
    order: number;
  }>;
}

export interface SignInput {
  letterId: string;
  signatureUrl: string;
  signerName: string;
  signerNip?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class PengantarService {
  /**
   * Get letters for Kaprodi dashboard (pending approval)
   */
  async getKaprodiQueue(userId: string, params: PengantarListParams) {
    return pengantarRepository.getLettersForKaprodiApproval(userId, params);
  }

  /**
   * Get letters for Admin Prodi dashboard (pending drafting)
   */
  async getAdminProdiQueue(userId: string, params: PengantarListParams) {
    return pengantarRepository.getLettersForAdminProdiDraft(userId, params);
  }

  /**
   * Get letters pending signature (for Kaprodi/Kadep)
   */
  async getSignatureQueue(userId: string, role: string, params: PengantarListParams) {
    return pengantarRepository.getLettersForSignature(userId, role, params);
  }

  /**
   * Get letter detail with full context
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    const letter = await pengantarRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Check access permission
    const canAccess = this.checkAccessPermission(letter, userId, userRoles);
    if (!canAccess) {
      throw new AppError('Anda tidak memiliki akses ke surat ini', HTTP_STATUS.FORBIDDEN);
    }

    // Add action permissions
    const permissions = this.getActionPermissions(letter, userRoles);

    return { letter, permissions };
  }

  /**
   * Kaprodi approves submission
   */
  async approveSubmission(input: ApproveInput, userId: string, userRole: string) {
    const letter = await pengantarRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SUBMITTED) {
      throw new AppError('Surat tidak dalam status yang dapat disetujui', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== ROLES.KAPRODI) {
      throw new AppError('Surat tidak sedang di meja Kaprodi', HTTP_STATUS.BAD_REQUEST);
    }

    return pengantarRepository.approveSubmission(
      input.letterId,
      userId,
      userRole,
      input.notes
    );
  }

  /**
   * Kaprodi rejects submission
   */
  async rejectSubmission(input: RejectInput, userId: string, userRole: string) {
    const letter = await pengantarRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SUBMITTED) {
      throw new AppError('Surat tidak dalam status yang dapat ditolak', HTTP_STATUS.BAD_REQUEST);
    }

    if (!input.reason || input.reason.trim() === '') {
      throw new AppError('Alasan penolakan wajib diisi', HTTP_STATUS.BAD_REQUEST);
    }

    return pengantarRepository.rejectSubmission(
      input.letterId,
      userId,
      userRole,
      input.reason
    );
  }

  /**
   * Admin Prodi saves draft surat pengantar
   */
  async saveDraft(input: SaveDraftInput, userId: string, userRole: string) {
    const letter = await pengantarRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SURAT_PENGANTAR_DRAFT) {
      throw new AppError('Surat tidak dalam status drafting', HTTP_STATUS.BAD_REQUEST);
    }

    // Validate signatories
    if (!input.signatories || input.signatories.length === 0) {
      throw new AppError('Minimal satu penandatangan harus dipilih', HTTP_STATUS.BAD_REQUEST);
    }

    const draftInput: CreatePengantarDraftInput = {
      letterInstanceId: input.letterId,
      content: input.content as Prisma.JsonValue,
      tembusan: input.tembusan,
      signatories: input.signatories
    };

    return pengantarRepository.savePengantarDraft(draftInput, userId, userRole);
  }

  /**
   * Admin Prodi submits draft for signature
   */
  async submitForSignature(letterId: string, userId: string, userRole: string) {
    const letter = await pengantarRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SURAT_PENGANTAR_DRAFT) {
      throw new AppError('Surat tidak dalam status drafting', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if document exists
    const pengantarDoc = letter.documents.find(d => d.type === 'SURAT_PENGANTAR');
    if (!pengantarDoc || !pengantarDoc.content) {
      throw new AppError('Draft surat pengantar belum dibuat', HTTP_STATUS.BAD_REQUEST);
    }

    return pengantarRepository.submitDraftForSignature(letterId, userId, userRole);
  }

  /**
   * Sign surat pengantar (Kaprodi/Kadep)
   */
  async signPengantar(input: SignInput, userId: string, userRole: string) {
    const letter = await pengantarRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SURAT_PENGANTAR_REVIEW) {
      throw new AppError('Surat tidak dalam status review/signing', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda untuk menandatangani', HTTP_STATUS.FORBIDDEN);
    }

    // Validate signature URL
    if (!input.signatureUrl || input.signatureUrl.trim() === '') {
      throw new AppError('URL tanda tangan wajib diisi', HTTP_STATUS.BAD_REQUEST);
    }

    return pengantarRepository.signPengantar(
      input.letterId,
      userId,
      userRole,
      input.signatureUrl,
      input.signerName,
      input.signerNip
    );
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private checkAccessPermission(
    letter: Awaited<ReturnType<typeof pengantarRepository.getLetterById>>,
    userId: string,
    userRoles: string[]
  ): boolean {
    if (!letter) return false;

    // Owner can always access
    if (letter.createdById === userId) return true;

    // Current active role can access
    if (letter.currentActiveRole && userRoles.includes(letter.currentActiveRole)) {
      return true;
    }

    // Departemen roles can access letters from their prodi
    const depRoles: string[] = [ROLES.KAPRODI, ROLES.ADMIN_PRODI, ROLES.KADEP];
    if (userRoles.some(r => depRoles.includes(r))) {
      return true; // TODO: Add prodi-based filtering
    }

    return false;
  }

  private getActionPermissions(
    letter: Awaited<ReturnType<typeof pengantarRepository.getLetterById>>,
    userRoles: string[]
  ): Record<string, boolean> {
    if (!letter) {
      return {
        canApprove: false,
        canReject: false,
        canDraft: false,
        canSubmitDraft: false,
        canSign: false,
        canDownload: false
      };
    }

    const isKaprodi = userRoles.includes(ROLES.KAPRODI);
    const isAdminProdi = userRoles.includes(ROLES.ADMIN_PRODI);
    const isKadep = userRoles.includes(ROLES.KADEP);
    const isCurrentRole = letter.currentActiveRole
      ? userRoles.includes(letter.currentActiveRole)
      : false;

    return {
      // Kaprodi can approve/reject when status = SUBMITTED
      canApprove: isKaprodi && letter.status === LetterStatus.SUBMITTED && isCurrentRole,
      canReject: isKaprodi && letter.status === LetterStatus.SUBMITTED && isCurrentRole,

      // Admin Prodi can draft when status = SURAT_PENGANTAR_DRAFT
      canDraft: isAdminProdi && letter.status === LetterStatus.SURAT_PENGANTAR_DRAFT,
      canSubmitDraft: isAdminProdi && letter.status === LetterStatus.SURAT_PENGANTAR_DRAFT,

      // Kaprodi/Kadep can sign when status = SURAT_PENGANTAR_REVIEW and it's their turn
      canSign: (isKaprodi || isKadep) &&
        letter.status === LetterStatus.SURAT_PENGANTAR_REVIEW && isCurrentRole,

      // Download when completed
      canDownload: letter.status === LetterStatus.COMPLETED
    };
  }
}

export const pengantarService = new PengantarService();
