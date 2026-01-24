/**
 * Department Approval Module Types
 * Types untuk modul persetujuan departemen (Lingkup Departemen)
 * Sesuai Prompting.md Modul B: PENGANTAR (renamed to DEPARTMENT-APPROVAL)
 */

import type { LetterStatus, DocumentType, LetterCategory } from '../../generated/prisma/enums';

// ============================================================================
// Signature Configuration
// ============================================================================

/**
 * Konfigurasi penandatangan surat pengantar
 */
export interface DepartmentApprovalSignerConfig {
  role: string; // KAPRODI, KADEP
  name: string;
  nip: string;
  jabatan: string;
  order: number; // Urutan TTD
  status: 'PENDING' | 'SIGNED';
  signedAt?: Date;
}

/**
 * Signatories untuk dokumen pengantar
 */
export interface DepartmentApprovalSignatories {
  signers: DepartmentApprovalSignerConfig[];
  requestedBySubmitter: boolean; // Apakah request TTD Kadep dari pengaju?
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * DTO untuk Kaprodi approve pengajuan
 */
export interface ApproveSubmissionDTO {
  letterInstanceId: string;
  notes?: string;
}

/**
 * DTO untuk Kaprodi reject pengajuan
 */
export interface RejectSubmissionDTO {
  letterInstanceId: string;
  alasan: string; // Wajib
}

/**
 * DTO untuk Admin Prodi draft surat pengantar
 */
export interface CreateDepartmentApprovalDraftDTO {
  letterInstanceId: string;
  content: unknown; // TipTap JSON content
  tembusan?: string[]; // Array of user IDs
  perihal: string;
  signatories: DepartmentApprovalSignatories;
}

/**
 * DTO untuk update draft pengantar
 */
export interface UpdateDepartmentApprovalDraftDTO {
  content?: unknown;
  tembusan?: string[];
  perihal?: string;
  signatories?: Partial<DepartmentApprovalSignatories>;
}

/**
 * DTO untuk signing surat pengantar
 */
export interface SignDepartmentApprovalDTO {
  documentId: string;
  signatureUrl: string; // URL to signature image in MinIO
  notes?: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Item di dashboard Kaprodi
 */
export interface KaprodiDashboardItem {
  id: string;
  namaPengaju: string;
  judulSurat: string;
  tipeSurat: string;
  tanggalPengajuan: Date;
  status: LetterStatus;
  displayStatus: string;
  needsAction: boolean; // Apakah butuh aksi dari Kaprodi?
  actionType: 'APPROVE' | 'SIGN' | 'NONE';
}

/**
 * Item di dashboard Admin Prodi
 */
export interface AdminProdiDashboardItem {
  id: string;
  namaPengaju: string;
  judulSurat: string;
  tipeSurat: string;
  tanggalPengajuan: Date;
  status: LetterStatus;
  displayStatus: string;
  needsAction: boolean;
  actionType: 'DRAFT' | 'NONE';
}

/**
 * Item di dashboard Kadep
 */
export interface KadepDashboardItem {
  id: string;
  namaPengaju: string;
  judulSurat: string;
  tipeSurat: string;
  tanggalPengajuan: Date;
  status: LetterStatus;
  displayStatus: string;
  needsAction: boolean;
  actionType: 'SIGN' | 'NONE';
}

/**
 * Detail surat pengantar
 */
export interface DepartmentApprovalDetail {
  id: string;
  type: DocumentType;
  content: unknown | null;
  tembusan: string[] | null;
  perihal: string | null;
  isSigned: boolean;
  fileUrl: string | null;
  signatures: {
    signerRole: string;
    signerName: string;
    signerNip: string | null;
    signedAt: Date;
    order: number;
    signatureUrl: string | null;
  }[];
  // Letter instance info
  letterInstance: {
    id: string;
    status: LetterStatus;
    currentActiveRole: string | null;
    submissionValues: unknown;
    signatureConfig: unknown;
    createdBy: {
      id: string;
      name: string;
      email: string;
    };
  };
}

/**
 * Permissions untuk view pengantar
 */
export interface DepartmentApprovalPermissions {
  // Kaprodi
  canApprove: boolean;
  canReject: boolean;
  canSign: boolean;

  // Admin Prodi
  canDraft: boolean;
  canEditDraft: boolean;
  canSubmitDraft: boolean;
  canEditSignatories: boolean;

  // Kadep
  canSignAsKadep: boolean;

  // View permissions
  showDraftButton: boolean;
  showSignButton: boolean;
  showApproveRejectButtons: boolean;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Filter untuk dashboard queries
 */
export interface DepartmentApprovalFilter {
  status?: LetterStatus[];
  needsAction?: boolean;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  programStudiId?: string;
  departemenId?: string;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Template surat pengantar
 */
export interface DepartmentApprovalTemplate {
  header: string;
  body: string;
  footer: string;
  signatureBlock: string;
}

/**
 * Data untuk generate surat pengantar
 */
export interface DepartmentApprovalGenerateData {
  nomorSurat?: string;
  tanggalSurat: Date;
  perihal: string;
  kepada: string;
  dari: string;
  isiSurat: string;
  lampiran: string[];
  tembusan: string[];
  signatories: DepartmentApprovalSignerConfig[];
}
