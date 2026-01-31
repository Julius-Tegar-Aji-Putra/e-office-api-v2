/**
 * Tembusan Types
 * Type definitions untuk fitur tembusan
 */

// ============================================================================
// USER TYPES FOR TEMBUSAN SELECTION
// ============================================================================

export interface TembusanUser {
  id: string;
  name: string;
  email: string;
  type: 'mahasiswa' | 'pegawai';
  identifier: string; // NIM for mahasiswa, NIP for pegawai
  department?: string;
  programStudi?: string;
  jabatan?: string; // For pegawai
}

export interface TembusanUserListResponse {
  success: boolean;
  data?: {
    users: TembusanUser[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error?: string;
}

// ============================================================================
// TEMBUSAN CONFIGURATION
// ============================================================================

export interface TembusanConfig {
  // User ID penerima tembusan
  userId: string;
  // Nama untuk ditampilkan di surat
  name: string;
  // Jabatan/keterangan (opsional)
  description?: string;
}

export interface TembusanRecipient extends TembusanConfig {
  // Additional fields when viewing tembusan
  email?: string;
  receivedAt?: string;
  isRead?: boolean;
}

// ============================================================================
// LETTER DOCUMENT TEMBUSAN
// ============================================================================

export interface LetterTembusanData {
  // Array of tembusan recipients (user IDs)
  recipients: TembusanConfig[];
  // Whether submitter is auto-included
  includeSubmitter: boolean;
}

// ============================================================================
// ACCESS CHECK TYPES
// ============================================================================

export interface TembusanAccessResult {
  hasAccess: boolean;
  reason?: string;
  isSubmitter?: boolean;
  isExplicitRecipient?: boolean;
}
