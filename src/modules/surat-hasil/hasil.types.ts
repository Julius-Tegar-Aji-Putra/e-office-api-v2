/**
 * Surat Hasil Types
 * Types untuk modul Surat Hasil (ST/SK - Surat Keluar)
 * Sesuai Prompting.md Modul D: SURAT HASIL
 */

import type {
  LetterStatus,
  LetterCategory,
  DocumentType,
  SignatureStatus,
} from '../../generated/prisma/enums';

// ============================================================================
// Enums & Constants
// ============================================================================

/**
 * Tipe template surat hasil
 */
export type SuratHasilType = 'ST' | 'SK';

/**
 * Method untuk signing document
 */
export type SigningMethod = 'UPLOAD' | 'CANVAS' | 'SAVED';

/**
 * Roles yang bisa TTD
 */
export const SIGNING_ROLES = [
  'KAPRODI',
  'KADEP',
  'DEKAN',
  'WAKIL_DEKAN_1',
  'WAKIL_DEKAN_2',
] as const;
export type SigningRole = (typeof SIGNING_ROLES)[number];

/**
 * Template fields untuk autofill dari submission
 */
export interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'textarea';
  required: boolean;
  autofillFrom?: string; // Path ke submissionValues
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * DTO untuk membuat draft surat hasil
 */
export interface CreateSuratHasilDTO {
  letterInstanceId: string;
  documentType: SuratHasilType;
  templateId?: string; // Optional template ID
  content: SuratHasilContent;
}

/**
 * Content surat hasil
 */
export interface SuratHasilContent {
  perihal: string;
  konsideran?: string; // Menimbang, Mengingat (untuk SK)
  diktum?: string; // Memutuskan (untuk SK)
  isiSurat: string;
  lampiran?: string;
  tembusan?: string[];
}

/**
 * DTO untuk update draft surat hasil
 */
export interface UpdateSuratHasilDTO {
  documentId: string;
  content: Partial<SuratHasilContent>;
  fileUrl?: string; // Generated PDF URL
}

/**
 * DTO untuk submit draft ke verifikasi
 */
export interface SubmitVerifikasiDTO {
  documentId: string;
  notes?: string;
}

/**
 * DTO untuk signature configuration
 */
export interface SignatureConfigDTO {
  documentId: string;
  signers: SignerConfig[];
}

export interface SignerConfig {
  role: string; // Role code
  order: number; // Urutan tanda tangan
  isRequired: boolean;
}

// ============================================================================
// Generate Draft Types
// ============================================================================

/**
 * DTO untuk generate HTML draft dari template
 */
export interface GenerateDraftDTO {
  letterInstanceId: string;
  templateId: string;
  variables: Record<string, string | number | Date>;
  tembusan?: TembusanItem[];
}

/**
 * Item tembusan (bisa manual text atau referensi user)
 */
export interface TembusanItem {
  type: 'TEXT' | 'USER';
  value: string; // Teks manual atau userId
  label?: string; // Nama user jika type = USER
}

/**
 * Response dari generate draft
 */
export interface GenerateDraftResponse {
  letterInstanceId: string;
  contentHtml: string;
  variables: Record<string, unknown>;
  tembusan: TembusanItem[];
}

// ============================================================================
// Signing Types
// ============================================================================

/**
 * DTO untuk sign document
 */
export interface SignDocumentDTO {
  letterInstanceId: string;
  signatureId: string; // DocumentSignature.id yang akan di-sign
  method: SigningMethod;
  
  // Method-specific fields
  savedSignatureId?: string; // Jika method = SAVED
  signatureFile?: File; // Jika method = UPLOAD atau CANVAS
  
  // Optional: simpan sebagai template
  saveAsTemplate?: boolean;
  templateAlias?: string;
}

/**
 * Response dari sign document
 */
export interface SignDocumentResponse {
  success: boolean;
  message: string;
  signature: {
    id: string;
    signerRole: string;
    signerName: string | null;
    status: SignatureStatus;
    signedAt: Date;
  };
  // Info template jika saveAsTemplate = true
  savedTemplate?: {
    id: string;
    alias: string | null;
  };
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Item di dashboard Staf (Surat Keluar yang perlu dikerjakan)
 */
export interface StafDraftingItem {
  id: string;
  letterInstanceId: string;
  namaPengaju: string;
  judulSurat: string;
  tipeSurat: SuratHasilType;
  jenisSurat: LetterCategory;
  tanggalDisposisi: Date;
  status: LetterStatus;
  displayStatus: string;
  needsAction: boolean;
  actionType: 'CREATE_DRAFT' | 'EDIT_DRAFT' | 'SUBMIT_VERIFIKASI' | 'NONE';
}

/**
 * Detail surat hasil untuk editing
 */
export interface SuratHasilDetail {
  letterInstance: {
    id: string;
    status: LetterStatus;
    currentActiveRole: string | null;
    letterCategory: LetterCategory;
    submissionValues: unknown;
    createdBy: {
      id: string;
      name: string;
      nim?: string;
      department?: {
        name: string;
        code: string;
      };
    };
  };
  document: {
    id: string;
    documentType: DocumentType;
    content: SuratHasilContent | null;
    fileUrl: string | null;
    isDraft: boolean;
    isSigned: boolean;
    nomorSurat: string | null;
    tanggalSurat: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  pengantarDocument: {
    id: string;
    fileUrl: string | null;
    isSigned: boolean;
  } | null;
  signatures: SignatureInfo[];
  disposisiHistory: DisposisiLog[];
  permissions: SuratHasilPermissions;
}

/**
 * Info penanda tangan
 */
export interface SignatureInfo {
  id: string;
  signerRole: string;
  signerName: string | null;
  order: number;
  status: SignatureStatus;
  signedAt: Date | null;
}

/**
 * Log disposisi untuk context
 */
export interface DisposisiLog {
  id: string;
  action: string;
  fromRole: string | null;
  toRole: string | null;
  actorName: string;
  notes: string | null;
  createdAt: Date;
}

/**
 * Permissions untuk surat hasil
 */
export interface SuratHasilPermissions {
  canCreateDraft: boolean;
  canEditDraft: boolean;
  canSubmitVerifikasi: boolean;
  canConfigureSigners: boolean;
  showTemplateSelector: boolean;
  showPreview: boolean;
}

// ============================================================================
// Template Types
// ============================================================================

/**
 * Template surat
 */
export interface SuratTemplate {
  id: string;
  code: string;
  name: string;
  type: SuratHasilType;
  category: LetterCategory;
  fields: TemplateField[];
  defaultSigners: SignerConfig[];
  createdAt: Date;
}

/**
 * Autofill data dari submission untuk template
 */
export interface AutofillData {
  namaPengaju: string;
  nimPengaju?: string;
  prodiPengaju?: string;
  departemenPengaju?: string;
  tanggalPengajuan: Date;
  judulPengajuan: string;
  [key: string]: unknown; // Dynamic fields dari submissionValues
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Filter untuk dashboard staf
 */
export interface StafDraftingFilter {
  jenisSurat?: LetterCategory;
  tipeSurat?: SuratHasilType;
  needsAction?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// Verification Chain Types
// ============================================================================

/**
 * Jalur verifikasi berdasarkan kategori
 * Sesuai Prompting.md Modul E
 */
export const VERIFICATION_CHAIN = {
  AKADEMIK: ['STAF_AKADEMIK', 'SPV_AKADEMIK', 'MANAJER_TU', 'WADEK_1', 'DEKAN'],
  SUMBER_DAYA: ['STAF_SUMBER_DAYA', 'SPV_SUMBER_DAYA', 'MANAJER_TU', 'WADEK_2', 'DEKAN'],
  UMUM: ['STAF_AKADEMIK', 'SPV_AKADEMIK', 'MANAJER_TU', 'WADEK_2', 'WADEK_1', 'DEKAN'], // Serial: Wadek 2 -> Wadek 1 -> Dekan
} as const;

/**
 * Get next verifier in chain
 */
export function getNextVerifier(currentRole: string, category: LetterCategory): string | null {
  const chain = VERIFICATION_CHAIN[category as keyof typeof VERIFICATION_CHAIN];
  if (!chain) return null;

  const currentIndex = chain.indexOf(currentRole as any);
  if (currentIndex === -1 || currentIndex >= chain.length - 1) return null;

  return chain[currentIndex + 1];
}

/**
 * Check if role is in verification chain for category
 */
export function isInVerificationChain(role: string, category: LetterCategory): boolean {
  const chain = VERIFICATION_CHAIN[category as keyof typeof VERIFICATION_CHAIN];
  return chain ? chain.includes(role as any) : false;
}
