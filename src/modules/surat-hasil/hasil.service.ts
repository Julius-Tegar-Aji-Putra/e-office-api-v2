/**
 * Surat Hasil Service
 * Business logic untuk modul drafting SK/ST/SP oleh staf
 */

import { hasilRepository, HasilListParams, CreateDraftInput, UpdateDraftInput, CreateStaffSuratInput, SURAT_HASIL_TYPES } from './hasil.repository';
import { LetterStatus, DocumentType, LetterCategory, Prisma, SignatureType } from '../../generated/prisma/client';
import { ROLES, STAF_ROLES, SUPERVISOR_ROLES, getReturnTargets, getFullVerificationFlow } from '../../shared/constants/roles';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';
import { MinioService } from '../../shared/services/minio.service';
import { signatureRepository } from '../signature/signature.repository';
import { prisma } from '../../db';

// ============================================================================
// VALIDATION HELPERS FOR SURAT_TUGAS_TABEL CONTENT
// ============================================================================

/**
 * Validasi konten SURAT_TUGAS_TABEL
 * - judulSurat: Required, Min 10, Max 255, tidak boleh hanya simbol
 * - keperluan: Required, Min 5, Max 150, tidak boleh hanya angka
 * - tanggalMulai: Required
 * - tanggalSelesai: Required, tidak boleh sebelum tanggalMulai
 */
function validateSuratTugasTabelContent(content: Record<string, unknown>): void {
  // Validate judulSurat
  const judulSurat = content.judulSurat;
  if (typeof judulSurat !== 'string' || !judulSurat.trim()) {
    throw new AppError('Judul Surat harus diisi!', HTTP_STATUS.BAD_REQUEST);
  }
  if (judulSurat.trim().length < 10) {
    throw new AppError('Judul Surat minimal 10 karakter!', HTTP_STATUS.BAD_REQUEST);
  }
  if (judulSurat.trim().length > 255) {
    throw new AppError('Judul Surat maksimal 255 karakter!', HTTP_STATUS.BAD_REQUEST);
  }
  // Check if only symbols (must contain at least one alphanumeric character)
  const hasAlphanumeric = /[a-zA-Z0-9]/.test(judulSurat);
  if (!hasAlphanumeric) {
    throw new AppError('Judul Surat tidak boleh hanya berisi simbol!', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate keperluan
  const keperluan = content.keperluan;
  if (typeof keperluan !== 'string' || !keperluan.trim()) {
    throw new AppError('Keperluan harus diisi!', HTTP_STATUS.BAD_REQUEST);
  }
  if (keperluan.trim().length < 5) {
    throw new AppError('Keperluan minimal 5 karakter!', HTTP_STATUS.BAD_REQUEST);
  }
  if (keperluan.trim().length > 150) {
    throw new AppError('Keperluan maksimal 150 karakter!', HTTP_STATUS.BAD_REQUEST);
  }
  // Check if only numbers
  const isOnlyNumbers = /^\d+$/.test(keperluan.trim());
  if (isOnlyNumbers) {
    throw new AppError('Keperluan tidak boleh hanya berisi angka!', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate tanggalMulai
  const tanggalMulai = content.tanggalMulai;
  if (!tanggalMulai) {
    throw new AppError('Tanggal Mulai harus diisi!', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate tanggalSelesai
  const tanggalSelesai = content.tanggalSelesai;
  if (!tanggalSelesai) {
    throw new AppError('Tanggal Selesai harus diisi!', HTTP_STATUS.BAD_REQUEST);
  }

  // Compare dates: tanggalSelesai must not be before tanggalMulai
  const startDate = new Date(tanggalMulai as string);
  const endDate = new Date(tanggalSelesai as string);
  if (endDate < startDate) {
    throw new AppError('Tanggal Selesai tidak boleh sebelum Tanggal Mulai!', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate dataMahasiswa (pelaksana)
  const dataMahasiswa = content.dataMahasiswa as Array<Record<string, string>> | undefined;
  if (!dataMahasiswa || !Array.isArray(dataMahasiswa) || dataMahasiswa.length === 0) {
    throw new AppError('Minimal 1 data pelaksana harus diisi!', HTTP_STATUS.BAD_REQUEST);
  }

  // Validate each pelaksana
  for (let i = 0; i < dataMahasiswa.length; i++) {
    const pelaksana = dataMahasiswa[i];
    const rowNum = i + 1;

    // Validate nama - min 2, max 100, no numbers
    const nama = pelaksana.nama || '';
    if (!nama.trim()) {
      throw new AppError(`Data Pelaksana baris ${rowNum}: Nama harus diisi!`, HTTP_STATUS.BAD_REQUEST);
    }
    if (nama.trim().length < 2) {
      throw new AppError(`Data Pelaksana baris ${rowNum}: Nama minimal 2 karakter!`, HTTP_STATUS.BAD_REQUEST);
    }
    if (nama.length > 100) {
      throw new AppError(`Data Pelaksana baris ${rowNum}: Nama maksimal 100 karakter!`, HTTP_STATUS.BAD_REQUEST);
    }
    if (/\d/.test(nama)) {
      throw new AppError(`Data Pelaksana baris ${rowNum}: Nama tidak boleh mengandung angka!`, HTTP_STATUS.BAD_REQUEST);
    }

    // Validate NIM - must be 14 digits
    const nim = pelaksana.nim || '';
    if (!nim.trim()) {
      throw new AppError(`Data Pelaksana baris ${rowNum}: NIM harus diisi!`, HTTP_STATUS.BAD_REQUEST);
    }
    if (!/^\d{14}$/.test(nim.trim())) {
      throw new AppError(`Data Pelaksana baris ${rowNum}: NIM harus 14 digit angka!`, HTTP_STATUS.BAD_REQUEST);
    }

    // Validate prodi - min 5 chars
    const prodi = pelaksana.prodi || '';
    if (!prodi.trim()) {
      throw new AppError(`Data Pelaksana baris ${rowNum}: Prodi harus diisi!`, HTTP_STATUS.BAD_REQUEST);
    }
    if (prodi.trim().length < 5) {
      throw new AppError(`Data Pelaksana baris ${rowNum}: Prodi minimal 5 karakter!`, HTTP_STATUS.BAD_REQUEST);
    }
  }
}

// ============================================================================
// TYPES
// ============================================================================

// Tembusan recipient type - supports both user accounts and text entries
export interface TembusanRecipient {
  userId: string;  // Empty string for text-only entries, '__PENGAJU__' for special marker
  name: string;
  description?: string;
  email?: string;
}

export interface CreateDraftServiceInput {
  letterId: string;
  documentType: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN' | 'SURAT_PENGANTAR' | 'SURAT_TUGAS_TABEL';
  content: Record<string, unknown>;
  tembusan?: TembusanRecipient[];
  perihal?: string;
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

export interface UpdateDraftServiceInput {
  documentId: string;
  content?: Record<string, unknown>;
  tembusan?: TembusanRecipient[];
  perihal?: string;
  mode?: 'patch' | 'overwrite';
  signatories?: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string;
    prefix?: string; // Awalan tanda tangan, e.g., "Mengetahui,"
    order: number;
    x?: number;
    y?: number;
    page?: number;
  }>;
}

export interface CreateStaffSuratServiceInput {
  category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM';
  documentType: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN' | 'SURAT_TUGAS_TABEL';
  content: Record<string, unknown>;
  tembusan?: TembusanRecipient[];
  perihal?: string;
  targetSupervisor?: 'SUPERVISOR_AKADEMIK' | 'SUPERVISOR_SUMBER_DAYA'; // Untuk kategori UMUM
  signatories: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string;
    prefix?: string; // Awalan tanda tangan, e.g., "Mengetahui,"
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

    // Get category for return targets calculation
    const category = (letter.category || letter.letterType.category) as LetterCategory;
    
    // Get current user's active role (for return targets)
    const currentUserRole = userRoles.find(r => r === letter.currentActiveRole) || userRoles[0];
    
    // Calculate return targets (fleksibel - bisa ke role manapun di bawah posisi)
    const hasilReturnTargets = getReturnTargets(normalizeRole(currentUserRole), category);

    return {
      letter,
      existingDraft,
      permissions,
      hasilReturnTargets
    };
  }

  /**
   * Create new SK/ST draft
   * PERBAIKAN: Accept status SURAT_DIBUAT (baru didisposisikan) atau FAKULTAS_DRAFTING (sedang draft)
   */
  async createDraft(input: CreateDraftServiceInput, userId: string, userRole: string) {
    const letter = await hasilRepository.getLetterById(input.letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SURAT_DIBUAT && letter.status !== LetterStatus.FAKULTAS_DRAFTING) {
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

    // Validate SURAT_TUGAS_TABEL content
    if (input.documentType === 'SURAT_TUGAS_TABEL') {
      validateSuratTugasTabelContent(input.content);
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
      tembusan: input.tembusan as Prisma.JsonValue | undefined,
      perihal: input.perihal,
      signatories: input.signatories
    };

    return hasilRepository.createDraft(draftInput, userId, userRole);
  }

  /**
   * Update existing draft
   * Supports two modes:
   * - "patch" (default): Only update provided fields, keep existing data
   * - "overwrite": Replace all data with new input
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

    // Validate SURAT_TUGAS_TABEL content on update
    if (document.type === DocumentType.SURAT_TUGAS_TABEL && input.content) {
      validateSuratTugasTabelContent(input.content);
    }

    const updateInput: UpdateDraftInput = {
      documentId: input.documentId,
      content: input.content as Prisma.JsonValue | undefined,
      tembusan: input.tembusan as Prisma.JsonValue | undefined,
      perihal: input.perihal,
      mode: input.mode || 'patch',
      signatories: input.signatories
    };

    return hasilRepository.updateDraft(updateInput, userId, userRole);
  }

  /**
   * Submit draft for verification
   * PERBAIKAN: Accept status SURAT_DIBUAT atau FAKULTAS_DRAFTING
   */
  async submitForVerification(
    letterId: string,
    userId: string,
    userRole: string,
    targetSupervisor?: 'SUPERVISOR_AKADEMIK' | 'SUPERVISOR_SUMBER_DAYA'
  ) {
    const letter = await hasilRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    if (letter.status !== LetterStatus.SURAT_DIBUAT && letter.status !== LetterStatus.FAKULTAS_DRAFTING) {
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

    // Get category from letterInstance (set by Admin Fakultas) or letterType
    const category = letter.category as LetterCategory || letter.letterType.category as LetterCategory;
    
    // For UMUM category, require targetSupervisor
    if (category === 'UMUM' && !targetSupervisor) {
      throw new AppError('Untuk kategori Umum, harus memilih supervisor tujuan', HTTP_STATUS.BAD_REQUEST);
    }

    return hasilRepository.submitForVerification(letterId, userId, userRole, category, targetSupervisor);
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

    // Manajer TU verify -> kirim ke pejabat berdasarkan hierarki kategori
    if (userRole === ROLES.MANAJER_TU) {
      return hasilRepository.manajerTuApproveVerification(letterId, userId, userRole, notes);
    }

    throw new AppError('Hanya Supervisor atau Manajer TU yang dapat memverifikasi', HTTP_STATUS.FORBIDDEN);
  }

  /**
   * Pejabat (Wadek/Dekan) verify dan forward ke next role (ketika bukan penandatangan)
   * 
   * PENTING: Flow SELALU urut sesuai hierarki kategori:
   * - AKADEMIK: Wadek 1 -> Dekan -> UPA
   * - SUMBER_DAYA: Wadek 2 -> Dekan -> UPA
   * - UMUM: Wadek 2 -> Wadek 1 -> Dekan -> UPA
   * 
   * Fungsi ini hanya untuk pejabat yang BUKAN di daftar penandatangan.
   * Jika pejabat ADA di daftar penandatangan, gunakan signDocument.
   */
  async pejabatVerifyDocument(
    letterId: string,
    userId: string,
    userRole: string,
    notes?: string
  ) {
    const letter = await hasilRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Validate status - bisa di VERIFICATION atau SIGNING
    const validStatuses = [LetterStatus.FAKULTAS_VERIFICATION, LetterStatus.FAKULTAS_SIGNING];
    if (!validStatuses.includes(letter.status as any)) {
      throw new AppError('Surat tidak dalam status yang bisa diverifikasi pejabat', HTTP_STATUS.BAD_REQUEST);
    }

    // Normalize role for comparison
    const normalizedUserRole = normalizeRole(userRole);
    const normalizedActiveRole = normalizeRole(letter.currentActiveRole || '');

    if (normalizedActiveRole !== normalizedUserRole) {
      throw new AppError('Bukan giliran Anda untuk memverifikasi', HTTP_STATUS.FORBIDDEN);
    }

    // Validate is pejabat
    const isPejabat = [ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2].includes(normalizedUserRole as any);
    if (!isPejabat) {
      throw new AppError('Hanya pejabat (Dekan/Wadek) yang dapat menggunakan fungsi ini', HTTP_STATUS.FORBIDDEN);
    }

    // Check if this pejabat is a signer
    const skstDocument = letter.documents.find(d => isSuratHasilType(d.type));
    if (skstDocument) {
      const isSigner = skstDocument.signatures.some(
        sig => normalizeRole(sig.signerRole) === normalizedUserRole
      );
      
      if (isSigner) {
        throw new AppError(
          'Anda adalah penandatangan. Gunakan fungsi tanda tangan, bukan verifikasi',
          HTTP_STATUS.BAD_REQUEST
        );
      }
    }

    return hasilRepository.pejabatVerifyDocument(letterId, userId, userRole, notes);
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

    // Status bisa SIGNING atau VERIFICATION (untuk backward compatibility dengan surat lama)
    const validSignStatuses = ['FAKULTAS_SIGNING', 'FAKULTAS_VERIFICATION'];
    if (!validSignStatuses.includes(letter.status)) {
      throw new AppError('Surat tidak dalam status penandatanganan', HTTP_STATUS.BAD_REQUEST);
    }

    // Normalize roles for comparison
    const normalizedActiveRole = normalizeRole(letter.currentActiveRole || '');
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
        throw new AppError('Gagal menyimpan tanda tangan', HTTP_STATUS.INTERNAL_ERROR);
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
    tembusan: TembusanRecipient[] | undefined,
    perihal: string | undefined,
    signatories: Array<{
      signerRole: string;
      signerName: string;
      signerNip?: string;
      prefix?: string;
      order: number;
      x?: number;
      y?: number;
      page?: number;
    }> | undefined,
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
      tembusan: tembusan as Prisma.JsonValue | undefined,
      perihal,
      signatories
    };

    return hasilRepository.updateDraft(updateInput, userId, userRole);
  }

  /**
   * Return letter for revision - FLEKSIBEL (bisa skip role)
   * 
   * PENTING: Return TIDAK harus urut. User bisa pilih langsung kembalikan ke role manapun 
   * yang sudah pernah memproses surat ini (di bawah posisi user saat ini).
   * 
   * @param targetStaffParam - Target role untuk revisi (dari dropdown)
   */
  async returnForRevision(
    letterId: string,
    userId: string,
    userRole: string,
    reason: string,
    targetStaffParam?: string
  ) {
    const letter = await hasilRepository.getLetterById(letterId);

    if (!letter) {
      throw new AppError('Surat tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Validate status - boleh di DRAFTING, VERIFICATION, atau SIGNING
    const validReturnStatuses = [
      'FAKULTAS_DRAFTING',
      'FAKULTAS_VERIFICATION',
      'FAKULTAS_SIGNING'
    ];
    if (!validReturnStatuses.includes(letter.status)) {
      throw new AppError('Surat tidak dalam status yang bisa dikembalikan', HTTP_STATUS.BAD_REQUEST);
    }

    // Normalize role for comparison
    const normalizedUserRole = normalizeRole(userRole);
    const normalizedActiveRole = normalizeRole(letter.currentActiveRole || '');

    // Validasi role active
    if (normalizedActiveRole !== normalizedUserRole) {
      throw new AppError('Bukan giliran Anda untuk memproses surat ini', HTTP_STATUS.FORBIDDEN);
    }

    // Get category untuk determine valid return targets
    // Default ke UMUM jika kategori tidak tersedia
    const rawCategory = letter.category || letter.letterType?.category;
    const category = (rawCategory || 'UMUM') as LetterCategory;
    
    console.log('[returnForRevision] Debug:', {
      normalizedUserRole,
      category,
      targetStaffParam,
      letterStatus: letter.status
    });
    
    // Get valid return targets menggunakan fungsi dari roles.ts
    const validTargets = getReturnTargets(normalizedUserRole, category);
    
    console.log('[returnForRevision] Valid targets:', validTargets);
    
    if (validTargets.length === 0) {
      throw new AppError('Anda tidak dapat mengembalikan surat ini', HTTP_STATUS.FORBIDDEN);
    }

    // Determine target role
    let targetRole: string;
    if (targetStaffParam) {
      // Validate target is in allowed list
      const normalizedTarget = normalizeRole(targetStaffParam);
      console.log('[returnForRevision] Checking target:', normalizedTarget, 'in', validTargets);
      if (!validTargets.includes(normalizedTarget)) {
        throw new AppError(
          `Target revisi tidak valid. Target yang diperbolehkan: ${validTargets.join(', ')}`,
          HTTP_STATUS.BAD_REQUEST
        );
      }
      targetRole = normalizedTarget;
    } else {
      // Default ke target pertama (biasanya langsung di bawah user)
      targetRole = validTargets[0];
    }

    // Determine target status based on target role
    // Staf -> DRAFTING, others -> VERIFICATION
    const isStafTarget = ['STAF_AKADEMIK', 'STAF_SUMBER_DAYA'].includes(targetRole);
    const targetStatus = isStafTarget ? LetterStatus.FAKULTAS_DRAFTING : LetterStatus.FAKULTAS_VERIFICATION;

    return hasilRepository.returnForRevision(letterId, userId, userRole, reason, targetRole, targetStatus);
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
    // Staff Akademik can create AKADEMIK and UMUM letters
    // Staff Sumber Daya can create SUMBER_DAYA and UMUM letters
    if (userRole === ROLES.STAF_AKADEMIK && input.category !== 'AKADEMIK' && input.category !== 'UMUM') {
      throw new AppError('Staf Akademik hanya bisa membuat surat kategori Akademik atau Umum', HTTP_STATUS.BAD_REQUEST);
    }
    if (userRole === ROLES.STAF_SUMBER_DAYA && input.category !== 'SUMBER_DAYA' && input.category !== 'UMUM') {
      throw new AppError('Staf Sumber Daya hanya bisa membuat surat kategori Sumber Daya atau Umum', HTTP_STATUS.BAD_REQUEST);
    }

    // Note: targetSupervisor untuk UMUM dipilih saat submit for verification, bukan saat create

    // Validate SURAT_TUGAS_TABEL content
    if (input.documentType === 'SURAT_TUGAS_TABEL') {
      validateSuratTugasTabelContent(input.content);
    }

    // Validate signatories
    if (!input.signatories || input.signatories.length === 0) {
      throw new AppError('Minimal satu penandatangan harus dipilih', HTTP_STATUS.BAD_REQUEST);
    }

    return hasilRepository.createStaffSurat({
      category: input.category,
      documentType: input.documentType,
      content: input.content as Prisma.JsonValue,
      tembusan: input.tembusan as Prisma.JsonValue | undefined,
      perihal: input.perihal,
      targetSupervisor: input.targetSupervisor,
      signatories: input.signatories
    }, userId, userRole);
  }

  // ==========================================================================
  // ATTACHMENT MANAGEMENT
  // ==========================================================================

  /**
   * Upload attachments to document
   * Only staff and supervisors can upload attachments
   * Supported formats: PDF, JPG, PNG
   */
  async uploadAttachments(
    documentId: string,
    files: File[],
    userId: string,
    userRole: string
  ): Promise<{ attachmentUrls: Array<{ url: string; name: string }> }> {
    // Check permission - staff, supervisors, and admin prodi can upload
    const allowedRoles: readonly string[] = [...STAF_ROLES, ...SUPERVISOR_ROLES, ROLES.ADMIN_PRODI];
    if (!allowedRoles.includes(userRole)) {
      throw new AppError('Anda tidak memiliki izin untuk mengunggah lampiran', HTTP_STATUS.FORBIDDEN);
    }

    // Validate files
    const validMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    for (const file of files) {
      if (!validMimeTypes.includes(file.type)) {
        throw new AppError(
          `Format file ${file.name} tidak didukung. Gunakan PDF, JPG, atau PNG`,
          HTTP_STATUS.BAD_REQUEST
        );
      }
      // Max 10MB per file
      if (file.size > 10 * 1024 * 1024) {
        throw new AppError(
          `File ${file.name} terlalu besar. Maksimal 10MB per file`,
          HTTP_STATUS.BAD_REQUEST
        );
      }
    }

    // Get document
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new AppError('Dokumen tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Upload files to MinIO and create metadata objects
    const minioService = new MinioService();
    const uploadedAttachments: Array<{ url: string; name: string }> = [];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(buffer);
      const timestamp = Date.now();
      const fileName = `${timestamp}-${file.name}`;
      const folder = `attachments/${documentId}`;
      
      const uploadResult = await minioService.uploadFile(fileBuffer, fileName, file.type, folder);
      // Store metadata: { url: storage path, name: original filename }
      uploadedAttachments.push({
        url: uploadResult.path,
        name: file.name // Store original filename
      });
    }

    // Append to existing attachments (support both old string[] and new object[] format)
    const existingData = ((document as any).attachmentUrls as any) || [];
    let existingAttachments: Array<{ url: string; name: string }> = [];
    
    // Migrate old format (string[]) to new format (object[])
    if (Array.isArray(existingData)) {
      existingAttachments = existingData.map(item => {
        if (typeof item === 'string') {
          // Old format: just URL, extract filename from path
          const urlPath = item.split('/').pop() || 'Lampiran';
          const cleanName = urlPath.replace(/^\d+-/, ''); // Remove timestamp prefix
          return { url: item, name: cleanName };
        }
        // New format: already an object
        return item as { url: string; name: string };
      });
    }

    const newAttachments = [...existingAttachments, ...uploadedAttachments];

    // Update document with new format
    await prisma.letterDocument.update({
      where: { id: documentId },
      data: { attachmentUrls: newAttachments } as any
    });

    // Convert storage paths to signed URLs for the response (keeping metadata)
    const signedAttachments = await Promise.all(
      newAttachments.map(async (attachment) => {
        if (attachment.url && !attachment.url.startsWith('http')) {
          try {
            const signedUrl = await minioService.getFileUrl(attachment.url);
            return { url: signedUrl, name: attachment.name };
          } catch (error) {
            console.error(`Failed to get signed URL for attachment:`, error);
            return attachment;
          }
        }
        return attachment;
      })
    );

    return { attachmentUrls: signedAttachments };
  }

  /**
   * Remove attachment from document by index
   */
  async removeAttachment(
    documentId: string,
    attachmentIndex: number,
    userId: string,
    userRole: string
  ): Promise<{ attachmentUrls: Array<{ url: string; name: string }> }> {
    // Check permission - staff, supervisors, and admin prodi can remove
    const allowedRoles: readonly string[] = [...STAF_ROLES, ...SUPERVISOR_ROLES, ROLES.ADMIN_PRODI];
    if (!allowedRoles.includes(userRole)) {
      throw new AppError('Anda tidak memiliki izin untuk menghapus lampiran', HTTP_STATUS.FORBIDDEN);
    }

    // Get document
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new AppError('Dokumen tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Support both old format (string[]) and new format (object[])
    const attachmentData = ((document as any).attachmentUrls as any) || [];
    let existingAttachments: Array<{ url: string; name: string }> = [];
    
    if (Array.isArray(attachmentData)) {
      existingAttachments = attachmentData.map(item => {
        if (typeof item === 'string') {
          const urlPath = item.split('/').pop() || 'Lampiran';
          const cleanName = urlPath.replace(/^\d+-/, '');
          return { url: item, name: cleanName };
        }
        return item as { url: string; name: string };
      });
    }

    if (attachmentIndex < 0 || attachmentIndex >= existingAttachments.length) {
      throw new AppError('Index lampiran tidak valid', HTTP_STATUS.BAD_REQUEST);
    }

    // Remove attachment at index
    const newAttachments = existingAttachments.filter((_, index) => index !== attachmentIndex);

    // Update document
    await prisma.letterDocument.update({
      where: { id: documentId },
      data: { attachmentUrls: newAttachments } as any
    });

    return { attachmentUrls: newAttachments };
  }

  /**
   * Remove attachment from document by fileName
   */
  async removeAttachmentByName(
    documentId: string,
    fileName: string,
    userId: string,
    userRole: string
  ): Promise<{ attachmentUrls: Array<{ url: string; name: string }> }> {
    console.log('[SERVICE] removeAttachmentByName called:', { documentId, fileName, userId, userRole });
    
    // Check permission - staff, supervisors, and admin prodi can remove
    const allowedRoles: readonly string[] = [...STAF_ROLES, ...SUPERVISOR_ROLES, ROLES.ADMIN_PRODI];
    if (!allowedRoles.includes(userRole)) {
      throw new AppError('Anda tidak memiliki izin untuk menghapus lampiran', HTTP_STATUS.FORBIDDEN);
    }

    // Get document
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new AppError('Dokumen tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const attachmentData = ((document as any).attachmentUrls as any) || [];
    console.log('[SERVICE] Existing attachment data:', attachmentData);
    
    // Support both old format (string[]) and new format (object[])
    let existingAttachments: Array<{ url: string; name: string }> = [];
    
    if (Array.isArray(attachmentData)) {
      existingAttachments = attachmentData.map(item => {
        if (typeof item === 'string') {
          // Old format: just URL/path
          const urlPath = item.split('/').pop() || 'Lampiran';
          const cleanName = urlPath.replace(/^\\d+-/, ''); // Remove timestamp prefix
          return { url: item, name: cleanName };
        }
        // New format: already has metadata
        return item as { url: string; name: string };
      });
    }
    
    // Find attachment by name
    const attachmentToRemove = existingAttachments.find(att => att.name === fileName);
    
    console.log('[SERVICE] Attachment to remove:', attachmentToRemove);
    
    if (!attachmentToRemove) {
      throw new AppError(`Lampiran tidak ditemukan: ${fileName}`, HTTP_STATUS.NOT_FOUND);
    }

    // Delete file from MinIO
    try {
      const minioService = new MinioService();
      console.log('[SERVICE] Deleting from MinIO:', attachmentToRemove.url);
      await minioService.deleteFile(attachmentToRemove.url);
      console.log('[SERVICE] Successfully deleted from MinIO');
    } catch (error) {
      console.error('[SERVICE] Failed to delete file from MinIO:', error);
      // Continue with database update even if MinIO delete fails
    }

    // Remove attachment from array
    const newAttachments = existingAttachments.filter(att => att.name !== fileName);
    console.log('[SERVICE] New attachments after removal:', newAttachments);

    // Update document
    await prisma.letterDocument.update({
      where: { id: documentId },
      data: { attachmentUrls: newAttachments } as any
    });

    console.log('[SERVICE] Database updated successfully');
    return { attachmentUrls: newAttachments };
  }

  /**
   * Get attachment URLs for a document with metadata
   */
  async getAttachments(documentId: string): Promise<Array<{ url: string; name: string }>> {
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId }
    });

    if (!document) {
      throw new AppError('Dokumen tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const attachmentData = ((document as any).attachmentUrls as any) || [];
    
    // Support both old format (string[]) and new format (object[])
    let attachments: Array<{ url: string; name: string }> = [];
    
    if (Array.isArray(attachmentData)) {
      attachments = attachmentData.map(item => {
        if (typeof item === 'string') {
          // Old format: just URL/path
          const urlPath = item.split('/').pop() || 'Lampiran';
          const cleanName = urlPath.replace(/^\\d+-/, ''); // Remove timestamp prefix
          return { url: item, name: cleanName };
        }
        // New format: already has metadata
        return item as { url: string; name: string };
      });
    }
    
    // Convert storage paths to signed URLs
    const minioService = new MinioService();
    const result = await Promise.all(
      attachments.map(async (attachment) => {
        if (attachment.url && !attachment.url.startsWith('http')) {
          try {
            const signedUrl = await minioService.getFileUrl(attachment.url);
            return { url: signedUrl, name: attachment.name };
          } catch (error) {
            console.error(`Failed to get signed URL for attachment:`, error);
            return attachment;
          }
        }
        return attachment;
      })
    );

    return result;
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
      // Staf/Supervisor actions (saat DRAFTING dan mereka adalah currentActiveRole)
      // Supervisor bisa create draft, update draft, submit verification ketika menerima revisi
      canCreateDraft: (isStaff || isSupervisor) && isDrafting && isCurrentRole && !hasDraft,
      canUpdateDraft: (isStaff || isSupervisor) && isDrafting && isCurrentRole && hasDraft,
      canSubmitVerification: (isStaff || isSupervisor) && isDrafting && isCurrentRole && hasDraft,
      
      // Supervisor/Manajer TU actions saat VERIFICATION
      canApproveVerification: (isSupervisor || isManajerTU) && isVerification && isCurrentRole,
      canUpdateDraftAsSupervisor: (isSupervisor || isManajerTU) && isVerification && isCurrentRole && hasDraft,
      canReturnForRevision: ((isSupervisor || isManajerTU) && isVerification && isCurrentRole) || 
                            (isSupervisor && isDrafting && isCurrentRole && hasDraft)
    };
  }
}

export const hasilService = new HasilService();
