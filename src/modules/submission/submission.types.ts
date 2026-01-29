/**
 * Submission Module Types
 * Types spesifik untuk modul pengajuan surat
 */

import type { LetterCategory, DocumentType, Priority, LetterStatus } from '../../generated/prisma/enums';

// ============================================================================
// Input Types (Request Body)
// ============================================================================

/**
 * Data formulir pengajuan surat
 */
export interface SubmissionFormData {
  // Data Diri
  nama: string;
  nim?: string; // Untuk mahasiswa
  nip?: string; // Untuk dosen/pegawai
  departemen: string;
  programStudi: string;

  // Kebutuhan Surat
  jenisSurat: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN';
  keperluan: string;
  judulAcara: string;
  tanggalAcara: string; // ISO datetime string (2026-02-15T09:00:00Z)
  durasiAcara?: string; // e.g., "3 hari"
  lokasiAcara: string;

  // Konfigurasi TTD Surat Pengantar (sampai Kaprodi atau sampai Kadep)
  butuhTtdKadep: boolean;
}

/**
 * Request body untuk create submission
 */
export interface CreateSubmissionDTO {
  letterTypeId: string;
  formData: SubmissionFormData;
  signatureConfig: SignatureConfigDTO;
}

/**
 * Konfigurasi tanda tangan yang diminta
 */
export interface SignatureConfigDTO {
  targetSigner: 'DEKAN' | 'WADEK_1' | 'WADEK_2';
  requestKadepSign: boolean; // Butuh TTD Kadep di surat pengantar?
}

/**
 * Request body untuk upload attachment
 */
export interface UploadAttachmentDTO {
  letterInstanceId: string;
  file: File;
  description?: string;
}

/**
 * Multipart form data untuk create submission dengan files
 * Semua field direpresentasikan flat karena multipart form-data
 */
export interface CreateSubmissionMultipartData {
  letterTypeId: string;
  // Form data fields (flat)
  nama: string;
  nim?: string;
  nip?: string;
  departemen: string;
  programStudi: string;
  jenisSurat: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN';
  keperluan: string;
  judulAcara: string;
  tanggalAcara: string; // ISO datetime
  durasiAcara?: string;
  lokasiAcara: string;
  butuhTtdKadep?: boolean | string;
  // Signature config fields (flat)
  targetSigner: 'DEKAN' | 'WADEK_1' | 'WADEK_2';
  requestKadepSign?: boolean | string;
  // Files
  attachments?: File[];
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response untuk daftar surat pengaju
 */
export interface SubmissionListItem {
  id: string;
  judulSurat: string;
  jenisSurat: DocumentType;
  tanggalPengajuan: Date;
  status: LetterStatus;
  displayStatus: string; // Human-readable status
  canEdit: boolean;
  canCancel: boolean;
  letterType: {
    id: string;
    name: string;
    code: string;
  };
}

/**
 * Response detail pengajuan lengkap
 */
export interface SubmissionDetail {
  id: string;
  submissionValues: SubmissionFormData;
  status: LetterStatus;
  displayStatus: string;
  priority: Priority;
  currentActiveRole: string | null;
  signatureConfig: SignatureConfigDTO | null;
  category: LetterCategory | null; // Kategori surat yang dipilih saat forward (bisa berbeda dari letterType.category)

  // Relations
  letterType: {
    id: string;
    name: string;
    code: string;
    category: LetterCategory;
  };
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  documents: DocumentSummary[];
  attachments: AttachmentSummary[];
  logs: LogSummary[];

  // Timestamps
  submittedAt: Date;
  completedAt: Date | null;

  // Computed permissions for UI
  permissions: SubmissionPermissions;
}

/**
 * Ringkasan dokumen (Pengantar/SK/ST)
 */
export interface DocumentSummary {
  id: string;
  type: DocumentType;
  nomorSurat: string | null;
  tanggalSurat: Date | null;
  perihal: string | null;
  isSigned: boolean;
  fileUrl: string | null;
  content: Record<string, unknown> | null; // Form data untuk generate preview
  contentHtml: string | null; // HTML content jika sudah di-generate
  signatures: SignatureSummary[];
}

/**
 * Ringkasan tanda tangan
 */
export interface SignatureSummary {
  signerRole: string;
  signerName: string;
  signedAt: Date;
  order: number;
  signatureUrl: string | null;
}

/**
 * Ringkasan lampiran
 */
export interface AttachmentSummary {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number | null;
  mimeType: string | null;
  description: string | null;
  uploadedAt: Date;
}

/**
 * Ringkasan log/riwayat
 */
export interface LogSummary {
  id: string;
  action: string;
  actorName: string;
  actorRole: string;
  fromStatus: LetterStatus | null;
  toStatus: LetterStatus | null;
  notes: string | null;
  createdAt: Date;
}

/**
 * Permissions yang dikirim ke frontend
 * Sesuai Prompting.md Section 6
 */
export interface SubmissionPermissions {
  canEdit: boolean; // Bisa edit submission (hanya jika DRAFT/RETURNED)
  canCancel: boolean; // Bisa membatalkan
  canDownload: boolean; // Bisa download surat hasil
  canResubmit: boolean; // Bisa submit ulang setelah revisi
  showSuratPengantar: boolean;
  showSuratHasil: boolean;
  showFormulirAwal: boolean;
  showRiwayat: boolean;
  showAlasanDitolak: boolean;
  // Department approval actions
  canApprove?: boolean;
  canReject?: boolean;
  canSign?: boolean;
  canDraft?: boolean;
  canSubmitDraft?: boolean;
  // Faculty actions
  canReceive?: boolean;
  canForward?: boolean;
  canDispose?: boolean;
  canComplete?: boolean;
  canVerify?: boolean;
  canReturn?: boolean;
  canFinish?: boolean;
  canAssignNumber?: boolean;
  canStamp?: boolean;
  // Surat Hasil (Staf)
  canDraftSuratHasil?: boolean; // Staf bisa buat draft SK/ST
  canEditDraft?: boolean; // Staf/Supervisor bisa edit draft yang dikembalikan
  canSubmitVerification?: boolean; // Staf submit untuk verifikasi naik
  // Verification actions (Pejabat)
  canVerifySuratHasil?: boolean; // Pejabat verifikasi surat hasil
  canSignSuratHasil?: boolean; // Pejabat yang menjadi target TTD
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Filter untuk list submissions
 */
export interface SubmissionFilter {
  status?: LetterStatus;
  letterTypeId?: string;
  category?: LetterCategory;
  search?: string; // Search by judul/keperluan
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Sort options untuk list
 */
export interface SubmissionSort {
  field: 'submittedAt' | 'status' | 'judulSurat';
  order: 'asc' | 'desc';
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * User context dari middleware auth
 */
export interface SubmissionUserContext {
  userId: string;
  userRoles: string[];
  mahasiswa?: {
    nim: string;
    departemenId: string;
    programStudiId: string;
  };
  pegawai?: {
    nip: string;
    jabatan: string;
    departemenId: string;
    programStudiId: string;
  };
}

/**
 * Letter type dengan template aktif
 */
export interface LetterTypeWithTemplate {
  id: string;
  name: string;
  code: string;
  description: string | null;
  category: LetterCategory;
  requiresPengantar: boolean;
  requiresDekanSign: boolean;
  requiresWadekSign: boolean;
  defaultTargetSigner: string | null;
  activeTemplate: {
    id: string;
    versionName: string;
    schemaDefinition: unknown;
    formFields: unknown;
  } | null;
}
