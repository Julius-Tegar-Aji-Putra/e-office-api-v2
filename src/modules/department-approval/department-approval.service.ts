/**
 * Department Approval Service
 * Business logic untuk modul department approval (Lingkup Departemen)
 * Handles: Kaprodi approval, Admin Prodi drafting surat pengantar, TTD flow Kaprodi/Kadep
 */

import { departmentApprovalRepository, DepartmentApprovalListParams, CreateDepartmentApprovalDraftInput } from './department-approval.repository';
import { LetterStatus, Prisma, SignatureType } from '../../generated/prisma/client';
import { ROLES } from '../../shared/constants/roles';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';
import { MinioService } from '../../shared/services/minio.service';
import { signatureRepository } from '../signature/signature.repository';
import { prisma } from '../../db';

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
    prefix?: string; // Awalan tanda tangan, e.g., "Mengetahui,"
    order: number;
    // Position data for signature placement on PDF
    x?: number;
    y?: number;
    page?: number;
  }>;
}

export interface SignInput {
  letterId: string;
  signatureData?: string; // base64 dari handwriting/upload
  signatureUrl?: string;  // URL dari saved signature
  saveSignature?: boolean;
  signerName?: string;
  signerNip?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class DepartmentApprovalService {
  /**
   * Get letters for Kaprodi dashboard (pending approval)
   */
  async getKaprodiQueue(userId: string, params: DepartmentApprovalListParams) {
    return departmentApprovalRepository.getLettersForKaprodiApproval(userId, params);
  }

  /**
   * Get letters for Admin Prodi dashboard (pending drafting)
   */
  async getAdminProdiQueue(userId: string, params: DepartmentApprovalListParams) {
    return departmentApprovalRepository.getLettersForAdminProdiDraft(userId, params);
  }

  /**
   * Get letters pending signature (for Kaprodi/Kadep)
   */
  async getSignatureQueue(userId: string, role: string, params: DepartmentApprovalListParams) {
    return departmentApprovalRepository.getLettersForSignature(userId, role, params);
  }

  /**
   * Get letter detail with full context
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    const letter = await departmentApprovalRepository.getLetterById(letterId);

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
    const letter = await departmentApprovalRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SUBMITTED) {
      throw new AppError('Surat tidak dalam status yang dapat disetujui', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== ROLES.KAPRODI) {
      throw new AppError('Surat tidak sedang di meja Kaprodi', HTTP_STATUS.BAD_REQUEST);
    }

    return departmentApprovalRepository.approveSubmission(
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
    const letter = await departmentApprovalRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SUBMITTED) {
      throw new AppError('Surat tidak dalam status yang dapat ditolak', HTTP_STATUS.BAD_REQUEST);
    }

    if (!input.reason || input.reason.trim() === '') {
      throw new AppError('Alasan penolakan wajib diisi', HTTP_STATUS.BAD_REQUEST);
    }

    return departmentApprovalRepository.rejectSubmission(
      input.letterId,
      userId,
      userRole,
      input.reason
    );
  }

  /**
   * Admin Prodi creates initial draft surat pengantar
   * Creates an empty document ready for editing
   */
  async createInitialDraft(letterId: string, userId: string, userRole: string) {
    const letter = await departmentApprovalRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SURAT_PENGANTAR_DRAFT) {
      throw new AppError('Surat tidak dalam status drafting', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== 'ADMIN_PRODI') {
      throw new AppError('Surat tidak sedang di meja Admin Prodi', HTTP_STATUS.BAD_REQUEST);
    }

    // Check if document already exists
    const existingDoc = letter.documents.find(d => d.type === 'SURAT_PENGANTAR');
    if (existingDoc) {
      throw new AppError('Surat pengantar sudah dibuat sebelumnya', HTTP_STATUS.BAD_REQUEST);
    }

    // Get signature config from submission
    const signatureConfig = letter.signatureConfig as { requestKadepSign?: boolean } | null;
    const needsKadepSignature = signatureConfig?.requestKadepSign || false;

    // Default signatories based on request
    const defaultSignatories = [
      {
        signerRole: 'KAPRODI',
        signerName: '', // Will be filled when signing
        signerNip: '',
        order: 1
      }
    ];

    if (needsKadepSignature) {
      defaultSignatories.push({
        signerRole: 'KADEP',
        signerName: '',
        signerNip: '',
        order: 2
      });
    }

    // Create initial empty draft
    const draftInput: CreateDepartmentApprovalDraftInput = {
      letterInstanceId: letterId,
      content: {
        // Empty template - will be filled by Admin Prodi
        perihal: letter.submissionValues && typeof letter.submissionValues === 'object' 
          ? (letter.submissionValues as any).keperluan || '' 
          : '',
        body: '',
        lampiran: '-'
      },
      tembusan: [],
      signatories: defaultSignatories
    };

    return departmentApprovalRepository.createInitialDraft(draftInput, userId, userRole);
  }

  /**
   * Admin Prodi saves draft surat pengantar
   */
  async saveDraft(input: SaveDraftInput, userId: string, userRole: string) {
    const letter = await departmentApprovalRepository.getLetterById(input.letterId);

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

    const draftInput: CreateDepartmentApprovalDraftInput = {
      letterInstanceId: input.letterId,
      content: input.content as Prisma.JsonValue,
      tembusan: input.tembusan,
      signatories: input.signatories
    };

    return departmentApprovalRepository.savePengantarDraft(draftInput, userId, userRole);
  }

  /**
   * Admin Prodi submits draft for signature
   */
  async submitForSignature(letterId: string, userId: string, userRole: string) {
    const letter = await departmentApprovalRepository.getLetterById(letterId);

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

    return departmentApprovalRepository.submitDraftForSignature(letterId, userId, userRole);
  }

  /**
   * Get letter info for determining signer role in route
   * Returns basic letter info including currentActiveRole
   */
  async getLetterForSigning(letterId: string) {
    const letter = await departmentApprovalRepository.getLetterById(letterId);
    if (!letter) return null;
    return {
      id: letter.id,
      status: letter.status,
      currentActiveRole: letter.currentActiveRole
    };
  }

  /**
   * Sign surat pengantar (Kaprodi/Kadep) with new signature format
   * PERBAIKAN: Properly upload signature to MinIO and save template if requested
   */
  async signPengantar(input: SignInput, userId: string, userRole: string) {
    const letter = await departmentApprovalRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SURAT_PENGANTAR_REVIEW) {
      throw new AppError('Surat tidak dalam status review/signing', HTTP_STATUS.BAD_REQUEST);
    }

    if (letter.currentActiveRole !== userRole) {
      throw new AppError('Bukan giliran Anda untuk menandatangani', HTTP_STATUS.FORBIDDEN);
    }

    // Validate that at least one signature format is provided
    if ((!input.signatureData || input.signatureData.trim() === '') &&
        (!input.signatureUrl || input.signatureUrl.trim() === '')) {
      throw new AppError('Tanda tangan (base64 atau URL) wajib diisi', HTTP_STATUS.BAD_REQUEST);
    }

    // Get user info for signer name/nip if not provided
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { pegawai: true }
    });

    const finalSignerName = input.signerName || user?.name || 'Penandatangan';
    const finalSignerNip = input.signerNip || user?.pegawai?.nip || '';

    let finalSignatureUrl = input.signatureUrl || '';
    let storagePath: string | undefined;

    // If signatureData is provided (base64), upload it to MinIO
    if (input.signatureData && input.signatureData.trim() !== '') {
      try {
        const minio = new MinioService();
        
        // Parse base64 data
        const matches = input.signatureData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
        if (!matches) {
          throw new AppError('Format tanda tangan tidak valid', HTTP_STATUS.BAD_REQUEST);
        }
        
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Create file name for upload
        const fileName = `signature-${userRole}-${Date.now()}.${mimeType}`;
        
        // Upload to MinIO
        const uploadResult = await minio.uploadFile(
          buffer,
          fileName,
          `image/${mimeType}`,
          `signatures/${userId}`
        );
        
        storagePath = uploadResult.path;
        
        // Get signed URL for the uploaded file
        finalSignatureUrl = await minio.getFileUrl(uploadResult.path);

        // Save to user's saved signatures if requested
        if (input.saveSignature) {
          try {
            await signatureRepository.createSavedSignature({
              userId,
              type: SignatureType.HANDWRITING,
              fileUrl: uploadResult.path, // Store the path, not the signed URL
              fileName: fileName,
              alias: `TTD ${userRole} - ${new Date().toLocaleDateString('id-ID')}`
            });
          } catch (saveErr) {
            // Log but don't fail the signing process
            console.error('Failed to save signature template:', saveErr);
          }
        }
      } catch (err) {
        console.error('Failed to upload signature:', err);
        if (err instanceof AppError) throw err;
        throw new AppError('Gagal menyimpan tanda tangan', HTTP_STATUS.INTERNAL_SERVER_ERROR);
      }
    } else if (input.signatureUrl) {
      // Using saved signature URL
      finalSignatureUrl = input.signatureUrl;
    }

    return departmentApprovalRepository.signPengantar(
      input.letterId,
      userId,
      userRole,
      finalSignatureUrl,
      finalSignerName,
      finalSignerNip,
      false // saveSignature already handled above
    );
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private checkAccessPermission(
    letter: Awaited<ReturnType<typeof departmentApprovalRepository.getLetterById>>,
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
    letter: Awaited<ReturnType<typeof departmentApprovalRepository.getLetterById>>,
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

export const departmentApprovalService = new DepartmentApprovalService();
