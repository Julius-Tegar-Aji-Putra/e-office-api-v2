/**
 * Legalisasi Types
 * Types untuk modul Legalisasi (UPA Finishing)
 * 
 * Workflow:
 * 1. UPA_NUMBERING: Berikan nomor surat & tanggal
 * 2. UPA_STAMPING: Bubuhkan stempel resmi
 * 3. UPA_FINALIZING: Generate QR Code & finalisasi
 * 4. COMPLETED: Siap didistribusikan
 */

import type {
  LetterStatus,
  LetterCategory,
  DocumentType,
  LegalisasiStatus
} from '../../generated/prisma/enums';

// ============================================================================
// Enums & Constants
// ============================================================================

/**
 * Format nomor surat standar Undip
 * Contoh: 001/UN7.5/ST/I/2026
 */
export interface NomorSuratFormat {
  nomor: string;        // 001 (sequence)
  kodeUnit: string;     // UN7.5 (kode fakultas)
  jenisKode: string;    // TU, HK, AK, KP (kode jenis surat)
  bulanRomawi: string;  // I, II, ... XII
  tahun: number;        // 2026
}

/**
 * Distribution method for completed letters
 */
export type DistributionMethod = 'EMAIL' | 'PICKUP' | 'COURIER';

/**
 * Seal position configuration
 */
export interface SealPosition {
  x: number;      // X coordinate (from left, percentage or pixel)
  y: number;      // Y coordinate (from top, percentage or pixel)
  width: number;  // Seal width
  height: number; // Seal height
  page: number;   // Page number (usually last page)
}

// ============================================================================
// Input Types
// ============================================================================

/**
 * DTO untuk penomoran surat
 */
export interface PenomoranInput {
  letterInstanceId: string;
  documentId: string;
  nomorSurat: string;
  tanggalSurat: Date;
}

/**
 * DTO untuk stempel
 */
export interface StempelInput {
  documentId: string;
  sealImageUrl?: string;      // Custom seal image URL
  sealPosition?: SealPosition;
}

/**
 * DTO untuk generate barcode/QR
 */
export interface GenerateBarcodeInput {
  documentId: string;
}

/**
 * DTO untuk finalisasi
 */
export interface FinalizeInput {
  documentId: string;
  fileUrl: string;  // Final PDF URL
  notes?: string;
}

/**
 * DTO untuk terbitkan & distribusi
 */
export interface TerbitkanInput {
  letterInstanceId: string;
  distributionMethod: DistributionMethod;
  recipientEmails?: string[]; // Untuk EMAIL
  notes?: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Item di dashboard UPA
 */
export interface UpaDashboardItem {
  id: string;                           // Letter Instance ID
  documentId: string;                   // Document ID
  judulSurat: string;                   // Judul/Perihal surat
  nomorSurat: string | null;            // '-' jika belum ada
  tipeSurat: DocumentType;              // SURAT_TUGAS/SURAT_KEPUTUSAN
  kategoriSurat: LetterCategory;
  tanggalMasuk: Date;
  status: LetterStatus;
  legalisasiStatus: LegalisasiStatus;
  displayStatus: string;                // Human-readable status
  needsAction: boolean;
  actionType: 'PENOMORAN' | 'STEMPEL' | 'FINALISASI' | 'COMPLETED';
  pemohon: {
    id: string;
    name: string;
    nim?: string;
    prodi?: string;
  };
  signatures: SignatureInfo[];
}

/**
 * Signature info untuk display
 */
export interface SignatureInfo {
  signerName: string;
  signerRole: string;
  signedAt: Date | null;
  status: string;
}

/**
 * Detail lengkap untuk halaman legalisasi
 */
export interface LegalisasiDetail {
  letterInstance: {
    id: string;
    status: LetterStatus;
    letterCategory: LetterCategory;
    submissionValues: unknown;
    createdAt: Date;
    createdBy: {
      id: string;
      name: string;
      nim?: string;
      email: string;
      prodi?: string;
      departemen?: string;
    };
    letterType: {
      id: string;
      name: string;
      code: string;
    };
  };
  document: {
    id: string;
    type: DocumentType;
    perihal: string | null;
    nomorSurat: string | null;
    tanggalSurat: Date | null;
    fileUrl: string | null;
    legalisasiStatus: LegalisasiStatus;
    sealImageUrl: string | null;
    barcodeData: string | null;
    qrCodeUrl: string | null;
    readyToDistribute: boolean;
    signatures: DocumentSignatureInfo[];
  };
  tembusan: TembusanInfo[];
  permissions: LegalisasiPermissions;
  nomorSuggestion: string | null;
}

/**
 * Document signature info
 */
export interface DocumentSignatureInfo {
  id: string;
  signerId: string;
  signerName: string;
  signerRole: string;
  signerNip: string | null;
  signatureUrl: string | null;
  status: string;
  signedAt: Date | null;
  order: number;
}

/**
 * Info tembusan
 */
export interface TembusanInfo {
  name: string;
  email?: string;
  unit?: string;
}

/**
 * Permissions untuk UPA
 */
export interface LegalisasiPermissions {
  canPenomoran: boolean;
  canStempel: boolean;
  canGenerateQR: boolean;
  canFinalize: boolean;
  showPenomoranForm: boolean;
  showStempelButton: boolean;
  showQRButton: boolean;
  showFinalizeButton: boolean;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Filter untuk dashboard UPA
 */
export interface UpaQueueFilter {
  status?: LetterStatus;
  legalisasiStatus?: LegalisasiStatus;
  kategori?: LetterCategory;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
}

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Result validasi nomor surat
 */
export interface NomorValidationResult {
  isValid: boolean;
  isDuplicate: boolean;
  formatError?: string;
  suggestion?: string;
}

/**
 * Used number record
 */
export interface UsedNumberRecord {
  nomorSurat: string;
  tanggalSurat: Date | null;
  perihal: string | null;
  letterType: string;
  createdAt: Date;
}

/**
 * QR Code generation result
 */
export interface QRCodeResult {
  qrCodeBase64: string;      // Base64 encoded QR code image
  qrCodeDataUrl: string;     // Data URL for direct embedding
  encryptedToken: string;    // Encrypted verification token
  verificationUrl: string;   // Full verification URL
}

/**
 * Verification result (for public endpoint)
 */
export interface VerificationResult {
  valid: boolean;
  status: 'VERIFIED' | 'NOT_FOUND' | 'INVALID_TOKEN' | 'EXPIRED';
  message: string;
  data?: {
    nomorSurat: string;
    tanggalSurat: string;
    perihal: string;
    jenisDocument: string;
    penandatangan: {
      nama: string;
      jabatan: string;
    }[];
    pemohon?: {
      nama: string;
      nim?: string;
    };
    dibuatPada: string;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert number to Roman numeral
 */
export function toRoman(num: number): string {
  const romanMap: [number, string][] = [
    [12, 'XII'], [11, 'XI'], [10, 'X'],
    [9, 'IX'], [8, 'VIII'], [7, 'VII'],
    [6, 'VI'], [5, 'V'], [4, 'IV'],
    [3, 'III'], [2, 'II'], [1, 'I'],
  ];

  for (const [value, roman] of romanMap) {
    if (num === value) return roman;
  }
  return '';
}

/**
 * Generate nomor surat suggestion
 * Format: XXX/UN7.5/TU/MONTH_ROMAN/YEAR
 */
export function generateNomorSuggestion(
  lastNomor: string | null,
  jenisKode: string = 'ST',
  kodeUnit: string = 'UN7.5'
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthRoman = toRoman(month);

  let sequence = 1;
  if (lastNomor) {
    // Extract sequence from last nomor (format: XXX/...)
    const parts = lastNomor.split('/');
    if (parts.length > 0) {
      const lastSeq = parseInt(parts[0], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }
  }

  const seqStr = sequence.toString().padStart(3, '0');
  return `${seqStr}/${kodeUnit}/${jenisKode}/${monthRoman}/${year}`;
}

/**
 * Validate nomor surat format
 * Acceptable formats:
 * - XXX/UN7.5/ST/I/2026  (3 segment)
 * - 001/UN7.5.1/HK/XII/2026 (with sub-unit)
 * - 050/UN7.5/SK/2026 (without month)
 */
export function validateNomorFormat(nomor: string): { valid: boolean; error?: string } {
  // More flexible pattern: sequence/unit-code/type-code[/month-roman]/year
  // Allow optional month roman numeral
  const pattern = /^\d{1,4}\/[A-Z0-9.]+\/[A-Z]{2,4}(\/[IVX]{1,4})?\/\d{4}$/;

  if (!pattern.test(nomor)) {
    return {
      valid: false,
      error: 'Format nomor surat tidak valid. Contoh: 001/UN7.5/ST/I/2026 atau 050/UN7.5/SK/2026',
    };
  }
  return { valid: true };
}

/**
 * Get action type based on legalisasi status
 */
export function getActionType(
  letterStatus: LetterStatus,
  legalisasiStatus: LegalisasiStatus
): 'PENOMORAN' | 'STEMPEL' | 'FINALISASI' | 'COMPLETED' {
  switch (letterStatus) {
    case 'UPA_NUMBERING':
      return 'PENOMORAN';
    case 'UPA_STAMPING':
      return 'STEMPEL';
    case 'UPA_FINALIZING':
      return 'FINALISASI';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      // Fallback based on legalisasi status
      switch (legalisasiStatus) {
        case 'PENDING':
          return 'PENOMORAN';
        case 'NOMOR_DIBERIKAN':
          return 'STEMPEL';
        case 'STEMPEL_DIBERIKAN':
        case 'QR_GENERATED':
          return 'FINALISASI';
        case 'COMPLETED':
          return 'COMPLETED';
        default:
          return 'PENOMORAN';
      }
  }
}

/**
 * Get display status text
 */
export function getDisplayStatus(
  letterStatus: LetterStatus,
  legalisasiStatus: LegalisasiStatus
): string {
  switch (letterStatus) {
    case 'UPA_NUMBERING':
      return 'Menunggu Penomoran';
    case 'UPA_STAMPING':
      return 'Menunggu Stempel';
    case 'UPA_FINALIZING':
      return legalisasiStatus === 'QR_GENERATED'
        ? 'Siap Finalisasi'
        : 'Generate QR Code';
    case 'COMPLETED':
      return 'Selesai';
    default:
      return letterStatus;
  }
}
