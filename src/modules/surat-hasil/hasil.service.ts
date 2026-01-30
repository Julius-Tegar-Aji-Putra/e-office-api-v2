/**
 * Surat Hasil Service
 * Business logic untuk modul drafting SK/ST/SP oleh staf
 */

import { hasilRepository, HasilListParams, CreateDraftInput, UpdateDraftInput, CreateStaffSuratInput, SURAT_HASIL_TYPES } from './hasil.repository';
import { LetterStatus, DocumentType, LetterCategory, Prisma, SignatureType } from '../../generated/prisma/client';
import { ROLES, STAF_ROLES, SUPERVISOR_ROLES } from '../../shared/constants/roles';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';
import { MinioService } from '../../shared/services/minio.service';
import { signatureRepository } from '../signature/signature.repository';
import { prisma } from '../../db';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateDraftServiceInput {
  letterId: string;
  documentType: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN' | 'SURAT_PENGANTAR' | 'SURAT_TUGAS_TABEL';
  content: Record<string, unknown>;
  tembusan?: string[];
  perihal?: string;
  signatories: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string;
    order: number;
    // Position data for signature placement on PDF
    x?: number;
    y?: number;
    page?: number;
  }>;
}

export interface UpdateDraftServiceInput {
  documentId: string;
  content?: Record<string, unknown>;
  tembusan?: string[];
  perihal?: string;
}

export interface CreateStaffSuratServiceInput {
  category: 'AKADEMIK' | 'SUMBER_DAYA';
  documentType: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN' | 'SURAT_TUGAS_TABEL';
  content: Record<string, unknown>;
  tembusan?: string[];
  perihal?: string;
  signatories: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string;
    order: number;
    x?: number;
    y?: number;
    page?: number;
  }>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize signer role to constant format
 */
const SIGNER_ROLE_NORMALIZATION: Record<string, string> = {
  'Dekan': 'DEKAN',
  'dekan': 'DEKAN',
  'Wakil Dekan I': 'WADEK_1',
  'Wakil Dekan 1': 'WADEK_1',
  'Wakil Dekan II': 'WADEK_2',
  'Wakil Dekan 2': 'WADEK_2',
  'DEKAN': 'DEKAN',
  'WADEK_1': 'WADEK_1',
  'WADEK_2': 'WADEK_2',
};

function normalizeRole(role: string): string {
  return SIGNER_ROLE_NORMALIZATION[role] || role.toUpperCase().replace(/\s+/g, '_');
}

/**
 * Check if document type is a surat hasil type
 */
const isSuratHasilType = (type: string): boolean => {
  return (SURAT_HASIL_TYPES as readonly string[]).includes(type);
};

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

    // Check access - more permissive for viewing
    const isStaff = userRoles.some(r => (STAF_ROLES as readonly string[]).includes(r));
    const isSupervisor = userRoles.some(r => (SUPERVISOR_ROLES as readonly string[]).includes(r));
    const isManajerTU = userRoles.includes(ROLES.MANAJER_TU);
    const isPejabat = userRoles.some(r => 
      [ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2].includes(r as any)
    );
    const isCurrentRole = letter.currentActiveRole
      ? userRoles.includes(letter.currentActiveRole)
      : false;
    
    // Allow access for: Staf, Supervisor, Manajer TU, Pejabat, or whoever is current active role
    // This is for VIEWING the document, not taking action
    const fakultasPhases: string[] = [
      'FAKULTAS_DRAFTING',
      'FAKULTAS_VERIFICATION',
      'FAKULTAS_SIGNING',
      'UPA_NUMBERING',
      'UPA_STAMPING',
      'UPA_FINALIZING',
      'COMPLETED'
    ];
    const isFakultasPhase = fakultasPhases.includes(letter.status);

    const hasViewAccess = isStaff || isSupervisor || isManajerTU || isPejabat || isCurrentRole;

    if (!hasViewAccess && !isFakultasPhase) {
      throw new AppError('Anda tidak memiliki akses', HTTP_STATUS.FORBIDDEN);
    }

    // Check existing SK/ST/SP document
    const existingDraft = letter.documents.find(
      d => isSuratHasilType(d.type)
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

    // Check if the same document type already exists
    // Allow different document types (e.g., SP can exist alongside ST/SK)
    const existingDoc = letter.documents.find(
      d => d.type === input.documentType || 
           // ST and ST_TABEL are considered the same type
           (input.documentType === 'SURAT_TUGAS' && d.type === 'SURAT_TUGAS_TABEL') ||
           (input.documentType === 'SURAT_TUGAS_TABEL' && d.type === 'SURAT_TUGAS')
    );

    if (existingDoc) {
      throw new AppError('Draft sudah ada, gunakan endpoint update', HTTP_STATUS.BAD_REQUEST);
    }

    // Validate signatories
    if (!input.signatories || input.signatories.length === 0) {
      throw new AppError('Minimal satu penandatangan harus dipilih', HTTP_STATUS.BAD_REQUEST);
    }

    // Map document type string to enum
    const docTypeMap: Record<string, DocumentType> = {
      'SURAT_TUGAS': DocumentType.SURAT_TUGAS,
      'SURAT_KEPUTUSAN': DocumentType.SURAT_KEPUTUSAN,
      'SURAT_PENGANTAR': DocumentType.SURAT_PENGANTAR,
      'SURAT_TUGAS_TABEL': DocumentType.SURAT_TUGAS_TABEL
    };
    const docType = docTypeMap[input.documentType] || DocumentType.SURAT_TUGAS;

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
      d => isSuratHasilType(d.type)
    );

    if (!hasDraft) {
      throw new AppError('Draft SK/ST/SP belum dibuat', HTTP_STATUS.BAD_REQUEST);
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
   * Supports:
   * - signatureData: base64 image from canvas/upload (preferred)
   * - signatureUrl: URL to existing signature (legacy)
   * - saveSignature: save the signature to user's saved signatures
   */
  async signDocument(
    letterId: string,
    signatureData: string | undefined,
    signatureUrl: string | undefined,
    signerName: string | undefined,
    signerNip: string | undefined,
    saveSignature: boolean,
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

    // Normalize roles for comparison
    const normalizedActiveRole = normalizeRole(letter.currentActiveRole);
    const normalizedUserRole = normalizeRole(userRole);

    console.log('[signDocument] Role check:', {
      letterCurrentActiveRole: letter.currentActiveRole,
      normalizedActiveRole,
      userRole,
      normalizedUserRole
    });

    if (normalizedActiveRole !== normalizedUserRole) {
      throw new AppError('Bukan giliran Anda untuk menandatangani', HTTP_STATUS.FORBIDDEN);
    }

    // Validate is pejabat that can sign
    const canSign = [
      ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2
    ].includes(normalizedUserRole as any);

    if (!canSign) {
      throw new AppError('Anda tidak memiliki wewenang untuk menandatangani', HTTP_STATUS.FORBIDDEN);
    }

    // Must have either signatureData or signatureUrl
    if (!signatureData && !signatureUrl) {
      throw new AppError('Data tanda tangan wajib diisi', HTTP_STATUS.BAD_REQUEST);
    }

    // Get user info for signer name/nip if not provided
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { pegawai: true }
    });

    const finalSignerName = signerName || user?.name || 'Penandatangan';
    const finalSignerNip = signerNip || user?.pegawai?.nip || '';

    let finalSignatureUrl = signatureUrl || '';

    // If signatureData is provided (base64), upload it
    if (signatureData) {
      try {
        const minio = new MinioService();
        
        // Parse base64 data
        const matches = signatureData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
        if (!matches) {
          throw new AppError('Format tanda tangan tidak valid', HTTP_STATUS.BAD_REQUEST);
        }
        
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Create file name for upload
        const fileName = `signature-${Date.now()}.${mimeType}`;
        
        // Upload to MinIO using uploadFile method
        const uploadResult = await minio.uploadFile(
          buffer,
          fileName,
          `image/${mimeType}`,
          `signatures/${userId}`
        );
        
        // Get signed URL for the uploaded file
        finalSignatureUrl = await minio.getFileUrl(uploadResult.path);

        // Save to user's saved signatures if requested
        if (saveSignature) {
          await signatureRepository.createSavedSignature({
            userId,
            type: SignatureType.HANDWRITING, // Canvas drawing / handwriting
            fileUrl: uploadResult.path, // Store the path, not the signed URL
            fileName: fileName,
            alias: `TTD ${new Date().toLocaleDateString('id-ID')}`
          });
        }
      } catch (err) {
        console.error('Failed to upload signature:', err);
        if (err instanceof AppError) throw err;
        throw new AppError('Gagal menyimpan tanda tangan', HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }
    }

    return hasilRepository.signDocument(
      letterId,
      finalSignatureUrl,
      finalSignerName,
      finalSignerNip,
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

    // Find surat hasil document
    const skstDocument = letter.documents.find(
      d => isSuratHasilType(d.type)
    );

    if (!skstDocument) {
      throw new AppError('Dokumen surat hasil tidak ditemukan', HTTP_STATUS.NOT_FOUND);
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

  /**
   * Create new staff surat directly (without submission)
   * For STAF_AKADEMIK and STAF_SUMBER_DAYA to create ST/SK directly
   */
  async createStaffSurat(input: CreateStaffSuratServiceInput, userId: string, userRole: string) {
    // Validate that user is a staff
    if (!(STAF_ROLES as readonly string[]).includes(userRole)) {
      throw new AppError('Hanya staf yang dapat membuat surat langsung', HTTP_STATUS.FORBIDDEN);
    }

    // Validate category matches staff role
    if (userRole === ROLES.STAF_AKADEMIK && input.category !== 'AKADEMIK') {
      throw new AppError('Staf Akademik hanya bisa membuat surat kategori Akademik', HTTP_STATUS.BAD_REQUEST);
    }
    if (userRole === ROLES.STAF_SUMBER_DAYA && input.category !== 'SUMBER_DAYA') {
      throw new AppError('Staf Sumber Daya hanya bisa membuat surat kategori Sumber Daya', HTTP_STATUS.BAD_REQUEST);
    }

    // Validate signatories
    if (!input.signatories || input.signatories.length === 0) {
      throw new AppError('Minimal satu penandatangan harus dipilih', HTTP_STATUS.BAD_REQUEST);
    }

    return hasilRepository.createStaffSurat({
      category: input.category,
      documentType: input.documentType,
      content: input.content,
      tembusan: input.tembusan,
      perihal: input.perihal,
      signatories: input.signatories
    }, userId, userRole);
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
      d => isSuratHasilType(d.type)
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
