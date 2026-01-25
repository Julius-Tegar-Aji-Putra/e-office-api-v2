/**
 * Surat Hasil Service
 * Business logic untuk modul drafting SK/ST oleh staf
 */

import { hasilRepository, HasilListParams, CreateDraftInput, UpdateDraftInput } from './hasil.repository';
import { LetterStatus, DocumentType, LetterCategory, Prisma } from '../../generated/prisma/client';
import { ROLES, STAF_ROLES, SUPERVISOR_ROLES } from '../../shared/constants/roles';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateDraftServiceInput {
  letterId: string;
  documentType: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN';
  content: Record<string, unknown>;
  tembusan?: string[];
  perihal?: string;
  signatories: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string;
    order: number;
  }>;
}

export interface UpdateDraftServiceInput {
  documentId: string;
  content?: Record<string, unknown>;
  tembusan?: string[];
  perihal?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class HasilService {
  /**
   * Get drafting queue for staff
   */
  async getDraftingQueue(userId: string, userRoles: string[], params: HasilListParams) {
    // Find staff role
    const staffRole = userRoles.find(r => (STAF_ROLES as readonly string[]).includes(r));
    
    if (!staffRole) {
      throw new AppError('Anda bukan staf', HTTP_STATUS.FORBIDDEN);
    }

    return hasilRepository.getLettersForDrafting(staffRole, params);
  }

  /**
   * Get letters drafted by staff
   */
  async getMyDraftedLetters(userId: string, params: HasilListParams) {
    return hasilRepository.getDraftedLetters(userId, params);
  }

  /**
   * Get letter detail for drafting
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    const letter = await hasilRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Check access
    const isStaff = userRoles.some(r => (STAF_ROLES as readonly string[]).includes(r));
    const isCurrentRole = letter.currentActiveRole
      ? userRoles.includes(letter.currentActiveRole)
      : false;

    if (!isStaff && !isCurrentRole) {
      throw new AppError('Anda tidak memiliki akses', HTTP_STATUS.FORBIDDEN);
    }

    // Check existing SK/ST document
    const existingDraft = letter.documents.find(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_KEPUTUSAN'
    );

    const permissions = this.getActionPermissions(letter, userRoles);

    return {
      letter,
      existingDraft,
      permissions
    };
  }

  /**
   * Create new SK/ST draft
   */
  async createDraft(input: CreateDraftServiceInput, userId: string, userRole: string) {
    const letter = await hasilRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.FAKULTAS_DRAFTING) {
      throw new AppError('Surat tidak dalam status drafting', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda untuk membuat draft', HTTP_STATUS.FORBIDDEN);
    }

    // Check if SK/ST already exists
    const existingDoc = letter.documents.find(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_KEPUTUSAN'
    );

    if (existingDoc) {
      throw new AppError('Draft sudah ada, gunakan endpoint update', HTTP_STATUS.BAD_REQUEST);
    }

    // Validate signatories
    if (!input.signatories || input.signatories.length === 0) {
      throw new AppError('Minimal satu penandatangan harus dipilih', HTTP_STATUS.BAD_REQUEST);
    }

    const docType = input.documentType === 'SURAT_TUGAS'
      ? DocumentType.SURAT_TUGAS
      : DocumentType.SURAT_KEPUTUSAN;

    const draftInput: CreateDraftInput = {
      letterInstanceId: input.letterId,
      documentType: docType,
      content: input.content as Prisma.JsonValue,
      tembusan: input.tembusan,
      perihal: input.perihal,
      signatories: input.signatories
    };

    return hasilRepository.createDraft(draftInput, userId, userRole);
  }

  /**
   * Update existing draft
   */
  async updateDraft(input: UpdateDraftServiceInput, userId: string, userRole: string) {
    const document = await hasilRepository.getDocumentById(input.documentId);

    if (!document) {
      throw new AppError('Dokumen tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const letter = document.letterInstance;

    // Only allow update during DRAFTING status or when returned
    if (letter.status !== LetterStatus.FAKULTAS_DRAFTING) {
      throw new AppError('Draft tidak dapat diubah pada status ini', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda untuk mengubah draft', HTTP_STATUS.FORBIDDEN);
    }

    const updateInput: UpdateDraftInput = {
      documentId: input.documentId,
      content: input.content as Prisma.JsonValue | undefined,
      tembusan: input.tembusan,
      perihal: input.perihal
    };

    return hasilRepository.updateDraft(updateInput, userId, userRole);
  }

  /**
   * Submit draft for verification
   */
  async submitForVerification(
    letterId: string,
    userId: string,
    userRole: string,
    targetSupervisor?: 'AKADEMIK' | 'SUMBER_DAYA'
  ) {
    const letter = await hasilRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.FAKULTAS_DRAFTING) {
      throw new AppError('Surat tidak dalam status drafting', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda', HTTP_STATUS.FORBIDDEN);
    }

    // Check if draft exists
    const hasDraft = letter.documents.some(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_KEPUTUSAN'
    );

    if (!hasDraft) {
      throw new AppError('Draft SK/ST belum dibuat', HTTP_STATUS.BAD_REQUEST);
    }

    // Determine category for routing
    let category = letter.letterType.category as LetterCategory;
    
    // For UMUM, use targetSupervisor if provided
    if (category === 'UMUM' && targetSupervisor) {
      category = targetSupervisor === 'AKADEMIK' ? LetterCategory.AKADEMIK : LetterCategory.SUMBER_DAYA;
    }

    return hasilRepository.submitForVerification(letterId, userId, userRole, category);
  }

  /**
   * Supervisor approve verification -> MANAJER_TU
   * Flow: SUPERVISOR approve → MANAJER_TU
   */
  async approveVerification(
    letterId: string,
    userId: string,
    userRole: string,
    notes?: string
  ) {
    const letter = await hasilRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.FAKULTAS_VERIFICATION) {
      throw new AppError('Surat tidak dalam status verifikasi', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda untuk memverifikasi', HTTP_STATUS.FORBIDDEN);
    }

    // Supervisor verify -> kirim ke Manajer TU
    const isSupervisor = (SUPERVISOR_ROLES as readonly string[]).includes(userRole);
    if (isSupervisor) {
      return hasilRepository.approveVerification(letterId, userId, userRole, notes);
    }

    // Manajer TU verify -> kirim ke signing
    if (userRole === ROLES.MANAJER_TU) {
      return hasilRepository.manajerTuApproveVerification(letterId, userId, userRole, notes);
    }

    throw new AppError('Hanya Supervisor atau Manajer TU yang dapat memverifikasi', HTTP_STATUS.FORBIDDEN);
  }

  /**
   * Sign SK/ST document (Dekan/Wadek)
   */
  async signDocument(
    letterId: string,
    signatureUrl: string,
    signerName: string,
    signerNip: string | undefined,
    userId: string,
    userRole: string
  ) {
    const letter = await hasilRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.FAKULTAS_SIGNING) {
      throw new AppError('Surat tidak dalam status penandatanganan', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda untuk menandatangani', HTTP_STATUS.FORBIDDEN);
    }

    // Validate is pejabat that can sign
    const canSign = [
      ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2
    ].includes(userRole as any);

    if (!canSign) {
      throw new AppError('Anda tidak memiliki wewenang untuk menandatangani', HTTP_STATUS.FORBIDDEN);
    }

    return hasilRepository.signDocument(
      letterId,
      signatureUrl,
      signerName,
      signerNip,
      userId,
      userRole
    );
  }

  /**
   * Supervisor/Manajer TU update draft (opsi edit)
   * Supervisor bisa edit draft yang dibuat staf
   * Pakai letterId, otomatis cari dokumen SK/ST-nya
   */
  async updateDraftAsSupervisor(
    letterId: string,
    content: Record<string, unknown> | undefined,
    tembusan: string[] | undefined,
    perihal: string | undefined,
    userId: string,
    userRole: string
  ) {
    const letter = await hasilRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.FAKULTAS_VERIFICATION) {
      throw new AppError('Draft tidak dapat diubah pada status ini', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda untuk mengubah draft', HTTP_STATUS.FORBIDDEN);
    }

    // Validate is supervisor or manajer TU
    const isSupervisor = (SUPERVISOR_ROLES as readonly string[]).includes(userRole);
    const isManajerTU = userRole === ROLES.MANAJER_TU;
    
    if (!isSupervisor && !isManajerTU) {
      throw new AppError('Hanya Supervisor/Manajer TU yang dapat mengubah draft', HTTP_STATUS.FORBIDDEN);
    }

    // Find SK/ST document
    const skstDocument = letter.documents.find(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_KEPUTUSAN'
    );

    if (!skstDocument) {
      throw new AppError('Dokumen SK/ST tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const updateInput: UpdateDraftInput = {
      documentId: skstDocument.id,
      content: content as Prisma.JsonValue | undefined,
      tembusan,
      perihal
    };

    return hasilRepository.updateDraft(updateInput, userId, userRole);
  }

  /**
   * Supervisor return draft for revision
   */
  async returnForRevision(
    letterId: string,
    userId: string,
    userRole: string,
    reason: string
  ) {
    const letter = await hasilRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.FAKULTAS_VERIFICATION) {
      throw new AppError('Surat tidak dalam status verifikasi', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda untuk memverifikasi', HTTP_STATUS.FORBIDDEN);
    }

    // Determine target staff based on supervisor type
    const targetStaff = userRole === ROLES.SUPERVISOR_AKADEMIK 
      ? ROLES.STAF_AKADEMIK 
      : ROLES.STAF_SUMBER_DAYA;

    return hasilRepository.returnForRevision(letterId, userId, userRole, reason, targetStaff);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private getActionPermissions(
    letter: Awaited<ReturnType<typeof hasilRepository.getLetterById>>,
    userRoles: string[]
  ): Record<string, boolean> {
    if (!letter) {
      return {
        canCreateDraft: false,
        canUpdateDraft: false,
        canSubmitVerification: false,
        canApproveVerification: false,
        canUpdateDraftAsSupervisor: false,
        canReturnForRevision: false
      };
    }

    const isStaff = userRoles.some(r => (STAF_ROLES as readonly string[]).includes(r));
    const isSupervisor = userRoles.some(r => (SUPERVISOR_ROLES as readonly string[]).includes(r));
    const isManajerTU = userRoles.includes(ROLES.MANAJER_TU);
    const isCurrentRole = letter.currentActiveRole
      ? userRoles.includes(letter.currentActiveRole)
      : false;
    const isDrafting = letter.status === LetterStatus.FAKULTAS_DRAFTING;
    const isVerification = letter.status === LetterStatus.FAKULTAS_VERIFICATION;

    const hasDraft = letter.documents.some(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_KEPUTUSAN'
    );

    return {
      // Staf actions
      canCreateDraft: isStaff && isDrafting && isCurrentRole && !hasDraft,
      canUpdateDraft: isStaff && isDrafting && isCurrentRole && hasDraft,
      canSubmitVerification: isStaff && isDrafting && isCurrentRole && hasDraft,
      
      // Supervisor/Manajer TU actions saat VERIFICATION
      canApproveVerification: (isSupervisor || isManajerTU) && isVerification && isCurrentRole,
      canUpdateDraftAsSupervisor: (isSupervisor || isManajerTU) && isVerification && isCurrentRole && hasDraft,
      canReturnForRevision: (isSupervisor || isManajerTU) && isVerification && isCurrentRole
    };
  }
}

export const hasilService = new HasilService();
