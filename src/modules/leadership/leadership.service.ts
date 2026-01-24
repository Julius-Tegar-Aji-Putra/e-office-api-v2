/**
 * Leadership Service
 * Business logic untuk modul verifikasi & tanda tangan pejabat
 */

import { leadershipRepository, LeadershipListParams, VerifyInput, SignInput, ReturnInput } from './leadership.repository';
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

class LeadershipService {
  /**
   * Get verification/signing queue
   */
  async getVerificationQueue(userRole: string, params: LeadershipListParams) {
    return leadershipRepository.getLettersForVerification(userRole, params);
  }

  /**
   * Get letter detail with verification context
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    const letter = await leadershipRepository.getLetterById(letterId);

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

    // For UMUM at Manajer TU level, show multi-select options
    const isUmumAtMTU = category === 'UMUM' && currentRole === ROLES.MANAJER_TU;
    const wadekOptions = isUmumAtMTU ? [ROLES.WADEK_1, ROLES.WADEK_2] : [];

    const permissions = this.getActionPermissions(letter, userRoles);

    return {
      letter,
      category,
      returnTargets,
      needsToSign,
      wadekOptions,
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
    const letter = await leadershipRepository.getLetterById(input.letterId);

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

    // Determine next verifier
    let nextRole: string;
    let nextStatus: LetterStatus = LetterStatus.FAKULTAS_VERIFICATION;

    // Special handling for UMUM category at Manajer TU
    if (category === 'UMUM' && userRole === ROLES.MANAJER_TU && input.nextTargets) {
      // Multi-select: always go to WADEK_2 first if both selected
      if (input.nextTargets.includes(ROLES.WADEK_2)) {
        nextRole = ROLES.WADEK_2;
      } else {
        nextRole = input.nextTargets[0] || ROLES.WADEK_1;
      }
    } else {
      const nextVerifier = getNextVerifier(userRole, category);
      if (!nextVerifier) {
        throw new AppError('Tidak ada verifier selanjutnya', HTTP_STATUS.BAD_REQUEST);
      }
      nextRole = nextVerifier;
    }

    // Check if next role is a signatory -> change to SIGNING
    if ((SIGNATORY_ROLES as readonly string[]).includes(nextRole)) {
      nextStatus = LetterStatus.FAKULTAS_SIGNING;
    }

    return leadershipRepository.verifyDocument(input, userId, userRole, nextRole, nextStatus);
  }

  /**
   * Sign document
   */
  async signDocument(input: SignInput, userId: string, userRole: string) {
    const letter = await leadershipRepository.getLetterById(input.letterId);

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

    return leadershipRepository.signDocument(input, userId, userRole, nextRole, nextStatus);
  }

  /**
   * Return document to lower role
   */
  async returnDocument(input: ReturnInput, userId: string, userRole: string) {
    const letter = await leadershipRepository.getLetterById(input.letterId);

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

    return leadershipRepository.returnDocument(input, userId, userRole);
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

    return leadershipRepository.updateDraftContent(documentId, content, userId, userRole);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private getActionPermissions(
    letter: Awaited<ReturnType<typeof leadershipRepository.getLetterById>>,
    userRoles: string[]
  ): Record<string, boolean> {
    if (!letter) {
      return {
        canVerify: false,
        canSign: false,
        canReturn: false,
        canEditDraft: false,
        showWadekOptions: false
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

    const category = letter.letterType.category;

    return {
      canVerify: isPejabat && isVerification && isCurrentRole && !needsToSign,
      canSign: isSignatory && (isVerification || isSigning) && isCurrentRole && (needsToSign ?? false),
      canReturn: isPejabat && (isVerification || isSigning) && isCurrentRole,
      canEditDraft: isSupervisor && isVerification && isCurrentRole,
      showWadekOptions: category === 'UMUM' && currentRole === ROLES.MANAJER_TU && isVerification
    };
  }
}

export const leadershipService = new LeadershipService();
