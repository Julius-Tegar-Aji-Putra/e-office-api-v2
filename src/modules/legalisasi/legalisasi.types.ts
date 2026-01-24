/**
 * Legalisasi Types
 * Types untuk modul Legalisasi (UPA Finishing)
 * Sesuai Prompting.md Modul F: LEGALISASI
 */

import type { LetterStatus, LetterCategory, DocumentType } from '../../generated/prisma/enums';

// ============================================================================
// Enums & Constants
// ============================================================================

/**
 * Format nomor surat
 * Contoh: 001/ST/FTI/I/2024
 */
export interface NomorSuratFormat {
  nomor: string; // 001
  jenis: string; // ST atau SK
  unit: string; // FTI
  bulanRomawi: string; // I, II, ... XII
  tahun: number; // 2024
}

/**
 * Distribution method
 */
export type DistributionMethod = 'EMAIL' | 'PICKUP' | 'COURIER';

// ============================================================================
// Input Types
// ============================================================================

/**
 * DTO untuk penomoran surat
 */
export interface PenomoranDTO {
  letterInstanceId: string;
  nomorSurat: string;
  tanggalSurat: Date;
}

/**
 * DTO untuk legalisasi (stempel & barcode)
 */
export interface LegalisasiDTO {
  letterInstanceId: string;
  stampPosition?: StampPosition;
  includeBarcode?: boolean;
}

/**
 * Posisi stempel
 */
export interface StampPosition {
  x: number;
  y: number;
  page?: number; // Default last page
}

/**
 * DTO untuk terbitkan & distribusi
 */
export interface TerbitkanDTO {
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
  id: string;
  judulSurat: string;
  nomorSurat: string | null; // '-' jika belum ada
  tipeSurat: string; // ST/SK
  jenisSurat: LetterCategory;
  tanggalMasuk: Date;
  status: LetterStatus;
  displayStatus: string;
  needsAction: boolean;
  actionType: 'PENOMORAN' | 'LEGALISASI' | 'TERBITKAN' | 'NONE';
}

/**
 * Detail legalisasi
 */
export interface LegalisasiDetail {
  letterInstance: {
    id: string;
    status: LetterStatus;
    letterCategory: LetterCategory;
    submissionValues: unknown;
    createdBy: {
      id: string;
      name: string;
      nim?: string;
      email: string;
    };
  };
  document: {
    id: string;
    documentType: DocumentType;
    content: unknown;
    fileUrl: string | null;
    nomorSurat: string | null;
    tanggalSurat: Date | null;
    isSigned: boolean;
    isStamped: boolean;
    barcodeUrl: string | null;
  } | null;
  tembusan: TembusanInfo[];
  permissions: LegalisasiPermissions;
  nomorSuggestion: string | null; // Suggested next number
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
  canLegalisasi: boolean;
  canTerbitkan: boolean;
  showPenomoranForm: boolean;
  showStempelButton: boolean;
  showTerbitkanButton: boolean;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Filter untuk dashboard UPA
 */
export interface UpaFilter {
  status?: 'UPA_PROCESSING' | 'COMPLETED';
  jenisSurat?: LetterCategory;
  hasNomor?: boolean;
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate nomor surat suggestion
 */
export function generateNomorSuggestion(
  lastNomor: string | null,
  jenisKode: string,
  unit: string = 'FTI'
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthRoman = toRoman(month);

  let sequence = 1;
  if (lastNomor) {
    // Extract sequence from last nomor
    const parts = lastNomor.split('/');
    if (parts.length > 0) {
      const lastSeq = parseInt(parts[0], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }
  }

  const seqStr = sequence.toString().padStart(3, '0');
  return `${seqStr}/${jenisKode}/${unit}/${monthRoman}/${year}`;
}

/**
 * Convert number to Roman numeral
 */
function toRoman(num: number): string {
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
 * Validate nomor surat format
 */
export function validateNomorFormat(nomor: string): { valid: boolean; error?: string } {
  const pattern = /^\d{3}\/[A-Z]{2}\/[A-Z]{2,5}\/[IVX]{1,4}\/\d{4}$/;
  if (!pattern.test(nomor)) {
    return {
      valid: false,
      error: 'Format nomor surat tidak valid. Contoh: 001/ST/FTI/I/2024',
    };
  }
  return { valid: true };
}

/**
 * Generate barcode data for validation
 */
export function generateBarcodeData(
  nomorSurat: string,
  documentId: string
): string {
  // Generate URL for QR verification
  const baseUrl = process.env.VERIFICATION_BASE_URL || 'https://verify.example.com';
  return `${baseUrl}/verify/${documentId}?n=${encodeURIComponent(nomorSurat)}`;
}
