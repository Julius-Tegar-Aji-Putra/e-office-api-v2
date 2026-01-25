/**
 * Faculty Approval Service
 * Business logic untuk modul verifikasi & tanda tangan pejabat fakultas
 */

import { facultyApprovalRepository, FacultyApprovalListParams, VerifyInput, SignInput, ReturnInput } from './faculty-approval.repository';
import { LetterStatus, LetterCategory, Prisma } from '../../generated/prisma/client';
import {
  ROLES,
  PEJABAT_ROLES,
  SIGNATORY_ROLES,
  getVerificationFlow,
  getNextVerifier,
  getReturnTargets
} from '../../shared/constants/roles';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';

// ============================================================================
// SERVICE CLASS
// ============================================================================

class FacultyApprovalService {
  /**
   * Get verification/signing queue
   */
  async getVerificationQueue(userRole: string, params: FacultyApprovalListParams) {
    return facultyApprovalRepository.getLettersForVerification(userRole, params);
  }

  /**
   * Get letter detail with verification context
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    const letter = await facultyApprovalRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Get category for verification flow
    const category = letter.letterType.category as LetterCategory;
    const currentRole = userRoles.find(r => r === letter.currentActiveRole);

    // Get available return targets
    const returnTargets = currentRole
      ? getReturnTargets(currentRole, category)
      : [];

    // Check if user needs to sign
    const skstDoc = letter.documents.find(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_KEPUTUSAN'
    );
    const needsToSign = skstDoc?.signatures.some(
      s => s.signerRole === currentRole && !s.signatureUrl
    );

    // NOTE: Routing otomatis - tidak ada pilihan manual
    // Sistem akan cek signature configuration untuk menentukan next role

    const permissions = this.getActionPermissions(letter, userRoles);

    return {
      letter,
      category,
      returnTargets,
      needsToSign,
      permissions
    };
  }

  /**
   * Verify document and forward to next level
   */
  async verifyDocument(
    input: VerifyInput,
    userId: string,
    userRole: string
  ) {
    const letter = await facultyApprovalRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.FAKULTAS_VERIFICATION) {
      throw new AppError('Surat tidak dalam status verifikasi', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda untuk verifikasi', HTTP_STATUS.FORBIDDEN);
    }

    const category = letter.letterType.category as LetterCategory;

    // Get SK/ST document to check signature configuration
    const skstDoc = letter.documents.find(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_KEPUTUSAN'
    );

    // Determine next role AUTOMATICALLY based on:
    // 1. Verification flow (jenis surat)
    // 2. Signature configuration (siapa saja yang TTD)
    let nextRole: string;
    let nextStatus: LetterStatus = LetterStatus.FAKULTAS_VERIFICATION;

    // Get default next verifier from flow
    const defaultNextVerifier = getNextVerifier(userRole, category);

    // Special handling: setelah Manajer TU, cek signature config untuk UMUM
    if (userRole === ROLES.MANAJER_TU && category === 'UMUM' && skstDoc) {
      // Cari penandatangan pertama yang belum TTD (berdasarkan order)
      const unsignedSigners = skstDoc.signatures
        .filter(s => !s.signatureUrl)
        .sort((a, b) => a.order - b.order);

      if (unsignedSigners.length > 0) {
        const firstUnsigned = unsignedSigners[0];
        // Untuk UMUM: jika ada Wadek 2 di daftar TTD, selalu ke Wadek 2 dulu
        const hasWadek2 = unsignedSigners.some(s => s.signerRole === ROLES.WADEK_2);
        const hasWadek1 = unsignedSigners.some(s => s.signerRole === ROLES.WADEK_1);
        
        if (hasWadek2) {
          // Wadek 2 ada di daftar TTD → ke Wadek 2 dulu
          nextRole = ROLES.WADEK_2;
        } else if (hasWadek1) {
          // Hanya Wadek 1 yang ada
          nextRole = ROLES.WADEK_1;
        } else {
          // Fallback ke Dekan langsung jika hanya Dekan yang TTD
          nextRole = firstUnsigned.signerRole;
        }
      } else {
        // Tidak ada yang perlu TTD, lanjut ke default flow
        nextRole = defaultNextVerifier || ROLES.DEKAN;
      }
    } else {
      // Non-UMUM atau bukan Manajer TU: ikuti flow standar
      if (!defaultNextVerifier) {
        throw new AppError('Tidak ada verifier selanjutnya', HTTP_STATUS.BAD_REQUEST);
      }
      nextRole = defaultNextVerifier;
    }

    // Check if next role is a signatory -> change to SIGNING
    if ((SIGNATORY_ROLES as readonly string[]).includes(nextRole)) {
      nextStatus = LetterStatus.FAKULTAS_SIGNING;
    }

    return facultyApprovalRepository.verifyDocument(input, userId, userRole, nextRole, nextStatus);
  }

  /**
   * Sign document
   */
  async signDocument(input: SignInput, userId: string, userRole: string) {
    const letter = await facultyApprovalRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const signableStatuses: LetterStatus[] = [LetterStatus.FAKULTAS_VERIFICATION, LetterStatus.FAKULTAS_SIGNING];
    if (!signableStatuses.includes(letter.status as LetterStatus)) {
      throw new AppError('Surat tidak dalam status yang dapat ditandatangani', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda untuk menandatangani', HTTP_STATUS.FORBIDDEN);
    }

    // Check if this role needs to sign
    const skstDoc = letter.documents.find(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_KEPUTUSAN'
    );

    if (!skstDoc) {
      throw new AppError('Dokumen SK/ST tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const mySig = skstDoc.signatures.find(s => s.signerRole === userRole);
    if (!mySig) {
      throw new AppError('Anda tidak termasuk penandatangan dokumen ini', HTTP_STATUS.FORBIDDEN);
    }

    if (mySig.signatureUrl) {
      throw new AppError('Anda sudah menandatangani dokumen ini', HTTP_STATUS.BAD_REQUEST);
    }

    // Validate signature URL
    if (!input.signatureUrl || input.signatureUrl.trim() === '') {
      throw new AppError('URL tanda tangan wajib diisi', HTTP_STATUS.BAD_REQUEST);
    }

    const category = letter.letterType.category as LetterCategory;

    // Determine next role and status
    let nextRole: string | null;
    let nextStatus: LetterStatus;

    // Check remaining unsigned signatures
    const unsignedSigs = skstDoc.signatures.filter(
      s => !s.signatureUrl && s.signerRole !== userRole
    );

    if (unsignedSigs.length === 0) {
      // All signed, move to UPA
      nextRole = ROLES.UPA;
      nextStatus = LetterStatus.UPA_NUMBERING;
    } else {
      // Find next signer
      const currentOrder = mySig.order;
      const nextSigner = skstDoc.signatures.find(
        s => s.order > currentOrder && !s.signatureUrl
      );

      if (nextSigner) {
        nextRole = nextSigner.signerRole;
        nextStatus = LetterStatus.FAKULTAS_SIGNING;
      } else {
        // No more signers in order, might need to continue verification
        const nextVerifier = getNextVerifier(userRole, category);
        if (nextVerifier) {
          nextRole = nextVerifier;
          nextStatus = (SIGNATORY_ROLES as readonly string[]).includes(nextVerifier)
            ? LetterStatus.FAKULTAS_SIGNING
            : LetterStatus.FAKULTAS_VERIFICATION;
        } else {
          // Shouldn't happen, but fallback to UPA
          nextRole = ROLES.UPA;
          nextStatus = LetterStatus.UPA_NUMBERING;
        }
      }
    }

    return facultyApprovalRepository.signDocument(input, userId, userRole, nextRole, nextStatus);
  }

  /**
   * Return document to lower role
   */
  async returnDocument(input: ReturnInput, userId: string, userRole: string) {
    const letter = await facultyApprovalRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const returnableStatuses: LetterStatus[] = [LetterStatus.FAKULTAS_VERIFICATION, LetterStatus.FAKULTAS_SIGNING];
    if (!returnableStatuses.includes(letter.status as LetterStatus)) {
      throw new AppError('Surat tidak dalam status yang dapat dikembalikan', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda', HTTP_STATUS.FORBIDDEN);
    }

    if (!input.reason || input.reason.trim() === '') {
      throw new AppError('Alasan pengembalian wajib diisi', HTTP_STATUS.BAD_REQUEST);
    }

    // Validate target is lower in hierarchy
    const category = letter.letterType.category as LetterCategory;
    const validTargets = getReturnTargets(userRole, category);

    if (!validTargets.includes(input.targetRole)) {
      throw new AppError('Target pengembalian tidak valid', HTTP_STATUS.BAD_REQUEST);
    }

    return facultyApprovalRepository.returnDocument(input, userId, userRole);
  }

  /**
   * Update draft (Supervisor only)
   */
  async updateDraft(
    documentId: string,
    content: Record<string, unknown>,
    userId: string,
    userRole: string
  ) {
    // Only supervisors can edit during verification
    if (!([ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA] as string[]).includes(userRole)) {
      throw new AppError('Hanya supervisor yang dapat mengedit draft', HTTP_STATUS.FORBIDDEN);
    }

    return facultyApprovalRepository.updateDraftContent(documentId, content, userId, userRole);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private getActionPermissions(
    letter: Awaited<ReturnType<typeof facultyApprovalRepository.getLetterById>>,
    userRoles: string[]
  ): Record<string, boolean> {
    if (!letter) {
      return {
        canVerify: false,
        canSign: false,
        canReturn: false,
        canEditDraft: false
      };
    }

    const isCurrentRole = letter.currentActiveRole
      ? userRoles.includes(letter.currentActiveRole)
      : false;
    const isPejabat = userRoles.some(r => (PEJABAT_ROLES as readonly string[]).includes(r));
    const supervisorRoles: string[] = [ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA];
    const isSupervisor = userRoles.some(r => supervisorRoles.includes(r));
    const isSignatory = userRoles.some(r => (SIGNATORY_ROLES as readonly string[]).includes(r));
    const isVerification = letter.status === LetterStatus.FAKULTAS_VERIFICATION;
    const isSigning = letter.status === LetterStatus.FAKULTAS_SIGNING;

    // Check if needs to sign
    const skstDoc = letter.documents.find(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_KEPUTUSAN'
    );
    const currentRole = userRoles.find(r => r === letter.currentActiveRole);
    const needsToSign = skstDoc?.signatures.some(
      s => s.signerRole === currentRole && !s.signatureUrl
    );

    return {
      canVerify: isPejabat && isVerification && isCurrentRole && !needsToSign,
      canSign: isSignatory && (isVerification || isSigning) && isCurrentRole && (needsToSign ?? false),
      canReturn: isPejabat && (isVerification || isSigning) && isCurrentRole,
      canEditDraft: isSupervisor && isVerification && isCurrentRole
      // NOTE: showWadekOptions dihapus - routing otomatis berdasarkan signature config
    };
  }
}

export const facultyApprovalService = new FacultyApprovalService();
