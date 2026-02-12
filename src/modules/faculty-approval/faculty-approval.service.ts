/**
 * Faculty Approval Service
 * Business logic untuk modul verifikasi & tanda tangan pejabat fakultas
 */

import { facultyApprovalRepository, FacultyApprovalListParams, VerifyInput, SignInput, ReturnInput } from './faculty-approval.repository';
import { LetterStatus, LetterCategory, Prisma, SignatureType } from '../../generated/prisma/client';
import {
  ROLES,
  PEJABAT_ROLES,
  SIGNATORY_ROLES,
  getVerificationFlow,
  getNextVerifier,
  getReturnTargets,
  getFullVerificationFlow
} from '../../shared/constants/roles';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';
import { MinioService } from '../../shared/services/minio.service';
import { signatureRepository } from '../signature/signature.repository';
import { prisma } from '../../db';

// Normalisasi role untuk perbandingan
const normalizeRole = (role: string): string => {
  const ROLE_MAP: Record<string, string> = {
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
  return ROLE_MAP[role] || role.toUpperCase().replace(/\s+/g, '_');
};

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
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_TUGAS_TABEL' || d.type === 'SURAT_KEPUTUSAN'
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
   * 
   * PENTING (per dokumen):
   * - Flow SELALU urut sesuai hierarki kategori, TIDAK bisa skip!
   * - Routing berdasarkan kategori, BUKAN berdasarkan siapa yang menandatangani
   * - Target signature hanya menentukan JENIS TOMBOL (verifikasi vs tanda tangan)
   * 
   * Flow per kategori:
   * - AKADEMIK: Staf Akademik → Supervisor Akademik → MTU → Wadek 1 → Dekan
   * - SUMBER_DAYA: Staf SD → Supervisor SD → MTU → Wadek 2 → Dekan
   * - UMUM: Staf → Supervisor → MTU → Wadek 2 → Wadek 1 → Dekan
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

    // Validate status
    const validStatuses = [LetterStatus.FAKULTAS_VERIFICATION, LetterStatus.FAKULTAS_SIGNING];
    if (!validStatuses.includes(letter.status as any)) {
      throw new AppError('Surat tidak dalam status verifikasi', HTTP_STATUS.BAD_REQUEST);
    }

    // Normalize roles for comparison
    const normalizedUserRole = normalizeRole(userRole);
    const normalizedActiveRole = normalizeRole(letter.currentActiveRole || '');

    if (normalizedActiveRole !== normalizedUserRole) {
      throw new AppError('Bukan giliran Anda untuk verifikasi', HTTP_STATUS.FORBIDDEN);
    }

    // Get category - bisa dari letterInstance atau letterType
    const category = (letter.category || letter.letterType.category) as LetterCategory;

    // Get SK/ST document untuk check apakah user adalah penandatangan
    const skstDoc = letter.documents.find(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_TUGAS_TABEL' || d.type === 'SURAT_KEPUTUSAN'
    );

    // Check if current user is a signer
    const isUserASigner = skstDoc?.signatures.some(
      s => normalizeRole(s.signerRole) === normalizedUserRole && !s.signatureUrl
    );

    // Jika user adalah penandatangan, TIDAK boleh pakai verifyDocument, harus signDocument
    if (isUserASigner) {
      throw new AppError(
        'Anda adalah penandatangan. Gunakan fungsi tanda tangan, bukan verifikasi',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Get next verifier BERDASARKAN HIERARKI KATEGORI (BUKAN berdasarkan signature config!)
    const nextRole = getNextVerifier(normalizedUserRole, category);

    if (!nextRole) {
      throw new AppError('Tidak ada verifier selanjutnya dalam hierarki', HTTP_STATUS.BAD_REQUEST);
    }

    // Determine status: jika next role adalah SIGNATORY → FAKULTAS_SIGNING
    // Tapi cek dulu apakah next role memang ada di daftar penandatangan
    let nextStatus: LetterStatus = LetterStatus.FAKULTAS_VERIFICATION;
    
    if ((SIGNATORY_ROLES as readonly string[]).includes(nextRole)) {
      // Check if next role is actually a signer for this document
      const isNextRoleASigner = skstDoc?.signatures.some(
        s => normalizeRole(s.signerRole) === nextRole
      );
      
      if (isNextRoleASigner) {
        nextStatus = LetterStatus.FAKULTAS_SIGNING;
      }
    }

    return facultyApprovalRepository.verifyDocument(input, userId, userRole, nextRole, nextStatus);
  }

  /**
   * Sign document
   * 
   * PENTING (per dokumen):
   * - HANYA pejabat yang ADA di daftar penandatangan yang bisa tanda tangan
   * - Setelah tanda tangan, sistem tetap routing ke NEXT ROLE di hierarki
   * - Next role akan menentukan sendiri: verifikasi atau tanda tangan
   * 
   * Contoh: Surat AKADEMIK dengan TTD Wadek 1 + Dekan
   * - Wadek 1 tanda tangan → sistem route ke Dekan (next di hierarki)
   * - Dekan adalah penandatangan? Ya → tampil tombol Tanda Tangan
   * - Dekan tanda tangan → semua sudah TTD → route ke UPA
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

    // Normalize roles
    const normalizedUserRole = normalizeRole(userRole);
    const normalizedActiveRole = normalizeRole(letter.currentActiveRole || '');

    if (normalizedActiveRole !== normalizedUserRole) {
      throw new AppError('Bukan giliran Anda untuk menandatangani', HTTP_STATUS.FORBIDDEN);
    }

    // Check if this role needs to sign
    const skstDoc = letter.documents.find(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_TUGAS_TABEL' || d.type === 'SURAT_KEPUTUSAN'
    );

    if (!skstDoc) {
      throw new AppError('Dokumen SK/ST tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const mySig = skstDoc.signatures.find(s => normalizeRole(s.signerRole) === normalizedUserRole);
    if (!mySig) {
      throw new AppError('Anda tidak termasuk penandatangan dokumen ini', HTTP_STATUS.FORBIDDEN);
    }

    if (mySig.signatureUrl) {
      throw new AppError('Anda sudah menandatangani dokumen ini', HTTP_STATUS.BAD_REQUEST);
    }

    // VALIDASI URUTAN: Pastikan semua penandatangan sebelumnya sudah TTD
    const myIndex = skstDoc.signatures.findIndex(s => normalizeRole(s.signerRole) === normalizedUserRole);
    for (let i = 0; i < myIndex; i++) {
      const prevSigner = skstDoc.signatures[i];
      if (!prevSigner.signatureUrl || !prevSigner.signedAt) {
        throw new AppError(
          `${prevSigner.signerRole.replace('_', ' ')} harus menandatangani terlebih dahulu`,
          HTTP_STATUS.BAD_REQUEST
        );
      }
    }

    // Validate that at least one signature format is provided
    if ((!input.signatureData || input.signatureData.trim() === '') &&
        (!input.signatureUrl || input.signatureUrl.trim() === '')) {
      throw new AppError('Data tanda tangan (base64 atau URL) wajib diisi', HTTP_STATUS.BAD_REQUEST);
    }

    // Get user info for signer name/nip if not provided
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { pegawai: true }
    });

    const finalSignerName = input.signerName || user?.name || 'Penandatangan';
    const finalSignerNip = input.signerNip || user?.pegawai?.nip || '';

    let finalSignatureUrl = '';

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
        
        // PERBAIKAN: Store storage path, NOT presigned URL (presigned URLs expire!)
        finalSignatureUrl = uploadResult.path;

        // Save to user's saved signatures if requested
        if (input.saveSignature) {
          try {
            await signatureRepository.createSavedSignature({
              userId,
              type: SignatureType.HANDWRITING,
              fileUrl: uploadResult.path,
              fileName: fileName,
              alias: `TTD ${userRole} - ${new Date().toLocaleDateString('id-ID')}`
            });
          } catch (saveErr) {
            console.error('Failed to save signature template:', saveErr);
          }
        }
      } catch (err) {
        console.error('Failed to upload signature:', err);
        if (err instanceof AppError) throw err;
        throw new AppError('Gagal menyimpan tanda tangan', HTTP_STATUS.INTERNAL_ERROR);
      }
    } else if (input.signatureUrl) {
      // PERBAIKAN: If signatureUrl is a presigned URL (from saved signature),
      // extract the storage path so it persists permanently
      const minio = new MinioService();
      const extractedPath = minio.extractStoragePath(input.signatureUrl);
      if (extractedPath) {
        finalSignatureUrl = extractedPath;
      } else {
        console.warn('[signDocument:faculty] Could not extract storage path from signatureUrl, using as-is');
        finalSignatureUrl = input.signatureUrl;
      }
    }

    const category = (letter.category || letter.letterType.category) as LetterCategory;

    // Determine next role dan status
    let nextRole: string | null;
    let nextStatus: LetterStatus;

    // Check remaining unsigned signatures
    const unsignedSigs = skstDoc.signatures.filter(
      s => !s.signatureUrl && normalizeRole(s.signerRole) !== normalizedUserRole
    );

    if (unsignedSigs.length === 0) {
      // SEMUA SUDAH TTD → ke UPA untuk penomoran
      nextRole = ROLES.UPA;
      nextStatus = LetterStatus.UPA_NUMBERING;
    } else {
      // MASIH ADA YANG BELUM TTD
      // Tetap ikuti hierarki: cari next role berdasarkan kategori
      const nextVerifier = getNextVerifier(normalizedUserRole, category);
      
      if (nextVerifier) {
        nextRole = nextVerifier;
        
        // Check if next role is a signer
        const isNextRoleASigner = skstDoc.signatures.some(
          s => normalizeRole(s.signerRole) === nextVerifier && !s.signatureUrl
        );
        
        nextStatus = isNextRoleASigner 
          ? LetterStatus.FAKULTAS_SIGNING 
          : LetterStatus.FAKULTAS_VERIFICATION;
      } else {
        // Tidak ada next role di hierarki, tapi masih ada yang belum TTD?
        // Ini seharusnya tidak terjadi jika flow benar, tapi handle sebagai fallback
        // Cari penandatangan berikutnya yang belum TTD
        const nextSigner = unsignedSigs[0];
        nextRole = normalizeRole(nextSigner.signerRole);
        nextStatus = LetterStatus.FAKULTAS_SIGNING;
      }
    }

    return facultyApprovalRepository.signDocument(
      {
        letterId: input.letterId,
        signatureUrl: finalSignatureUrl,
        signerName: finalSignerName,
        signerNip: finalSignerNip,
        notes: input.notes
      },
      userId, userRole, nextRole, nextStatus
    );
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

  /**
   * Get action permissions untuk UI
   * 
   * PENTING (per dokumen):
   * - IF (Role saat ini ADA di daftar target tanda tangan) → canSign=true, canVerify=false
   * - ELSE → canVerify=true, canSign=false
   * 
   * Target signature HANYA menentukan jenis tombol yang tampil!
   */
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

    // Find the user's role that matches currentActiveRole
    const currentRole = userRoles.find(r => normalizeRole(r) === normalizeRole(letter.currentActiveRole || ''));
    const isCurrentRole = !!currentRole;
    
    const isPejabat = userRoles.some(r => (PEJABAT_ROLES as readonly string[]).includes(r));
    const supervisorRoles: string[] = [ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA];
    const isSupervisor = userRoles.some(r => supervisorRoles.includes(r));
    const isSignatory = userRoles.some(r => (SIGNATORY_ROLES as readonly string[]).includes(r));
    const isVerification = letter.status === LetterStatus.FAKULTAS_VERIFICATION;
    const isSigning = letter.status === LetterStatus.FAKULTAS_SIGNING;

    // Check if user is in signature list (BELUM menandatangani)
    const skstDoc = letter.documents.find(
      d => d.type === 'SURAT_TUGAS' || d.type === 'SURAT_TUGAS_TABEL' || d.type === 'SURAT_KEPUTUSAN'
    );
    
    // PENTING: Check if ANY of user's roles is a signer
    const userSignerRole = userRoles.find(role => 
      skstDoc?.signatures.some(
        s => normalizeRole(s.signerRole) === normalizeRole(role) && !s.signatureUrl
      )
    );
    const needsToSign = !!userSignerRole;

    // LOGIC SESUAI DOKUMEN:
    // - Jika role saat ini ADA di daftar penandatangan → canSign=true
    // - Jika role saat ini TIDAK ADA di daftar penandatangan → canVerify=true
    const canSign = isSignatory && (isVerification || isSigning) && isCurrentRole && needsToSign;
    const canVerify = isPejabat && (isVerification || isSigning) && isCurrentRole && !needsToSign;

    return {
      canVerify,
      canSign,
      canReturn: isPejabat && (isVerification || isSigning) && isCurrentRole,
      canEditDraft: isSupervisor && isVerification && isCurrentRole
    };
  }
}

export const facultyApprovalService = new FacultyApprovalService();
