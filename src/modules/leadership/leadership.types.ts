/**
 * Leadership Types
 * Types untuk modul Leadership (Verifikasi Berjenjang - Surat Keluar)
 * Sesuai Prompting.md Modul E: LEADERSHIP
 */

import type { LetterStatus, LetterCategory, SignatureStatus } from '../../generated/prisma/enums';

// ============================================================================
// Enums & Constants
// ============================================================================

/**
 * Jalur verifikasi berdasarkan kategori
 * Sesuai Prompting.md:
 * - AKADEMIK: Staf -> Spv Akad -> Manajer TU -> Wadek I -> Dekan
 * - SUMBER_DAYA: Staf -> Spv SD -> Manajer TU -> Wadek II -> Dekan
 * - UMUM: Multi-select at Manajer TU level
 */
export const VERIFICATION_ROUTES = {
  AKADEMIK: ['SPV_AKADEMIK', 'MANAJER_TU', 'WADEK_1', 'DEKAN'],
  SUMBER_DAYA: ['SPV_SUMBER_DAYA', 'MANAJER_TU', 'WADEK_2', 'DEKAN'],
  UMUM_WADEK_1: ['SPV_AKADEMIK', 'MANAJER_TU', 'WADEK_1', 'DEKAN'],
  UMUM_WADEK_2: ['SPV_AKADEMIK', 'MANAJER_TU', 'WADEK_2', 'DEKAN'],
  UMUM_BOTH: ['SPV_AKADEMIK', 'MANAJER_TU', 'WADEK_2', 'WADEK_1', 'DEKAN'], // Serial
} as const;

/**
 * Aksi yang bisa dilakukan pejabat
 */
export type LeadershipAction = 'VERIFY' | 'SIGN' | 'RETURN';

/**
 * Return targets berdasarkan role
 */
export const RETURN_TARGETS: Record<string, string[]> = {
  SPV_AKADEMIK: ['STAF_AKADEMIK'],
  SPV_SUMBER_DAYA: ['STAF_SUMBER_DAYA'],
  MANAJER_TU: ['SPV_AKADEMIK', 'SPV_SUMBER_DAYA', 'STAF_AKADEMIK', 'STAF_SUMBER_DAYA'],
  WADEK_1: ['MANAJER_TU', 'SPV_AKADEMIK', 'STAF_AKADEMIK'],
  WADEK_2: ['MANAJER_TU', 'SPV_SUMBER_DAYA', 'STAF_SUMBER_DAYA'],
  DEKAN: ['WADEK_1', 'WADEK_2', 'MANAJER_TU'],
};

// ============================================================================
// Input Types
// ============================================================================

/**
 * DTO untuk verifikasi/approve
 */
export interface VerifyDocumentDTO {
  letterInstanceId: string;
  notes?: string;
}

/**
 * DTO untuk tanda tangan
 */
export interface SignDocumentDTO {
  letterInstanceId: string;
  documentId: string;
  signatureImageUrl?: string; // Optional jika menggunakan digital signature
}

/**
 * DTO untuk kembalikan dokumen
 */
export interface ReturnDocumentDTO {
  letterInstanceId: string;
  targetRole: string;
  alasan: string;
}

/**
 * DTO untuk Manajer TU memilih jalur UMUM
 */
export interface SelectUmumRouteDTO {
  letterInstanceId: string;
  route: 'WADEK_1' | 'WADEK_2' | 'BOTH';
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Item di dashboard Pejabat (Surat Keluar yang perlu diverifikasi/ditandatangani)
 */
export interface LeadershipDashboardItem {
  id: string;
  judulSurat: string;
  tipeSurat: string; // ST/SK
  jenisSurat: LetterCategory;
  tanggalSubmit: Date;
  status: LetterStatus;
  displayStatus: string;
  needsAction: boolean;
  actionType: 'VERIFY' | 'SIGN' | 'SELECT_ROUTE' | 'NONE';
  submittedBy?: string; // Role yang submit
  hasSignature: boolean; // Apakah user ini perlu tanda tangan di surat ini
}

/**
 * Detail untuk view verifikasi
 */
export interface LeadershipDetail {
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
    };
  };
  document: {
    id: string;
    documentType: string;
    content: unknown;
    fileUrl: string | null;
    isDraft: boolean;
    isSigned: boolean;
    nomorSurat: string | null;
  } | null;
  signatures: SignatureInfo[];
  verificationHistory: VerificationLogItem[];
  permissions: LeadershipPermissions;
  returnTargets: ReturnTargetOption[];
  routeOptions?: RouteOption[]; // Hanya untuk Manajer TU dengan kategori UMUM
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
  isCurrentUserTurn: boolean;
}

/**
 * Log verifikasi
 */
export interface VerificationLogItem {
  id: string;
  action: string;
  fromRole: string | null;
  toRole: string | null;
  actorName: string;
  notes: string | null;
  createdAt: Date;
}

/**
 * Permissions untuk leadership view
 */
export interface LeadershipPermissions {
  canVerify: boolean;
  canSign: boolean;
  canReturn: boolean;
  canSelectRoute: boolean; // Manajer TU untuk UMUM
  showVerifyButton: boolean;
  showSignButton: boolean;
  showReturnButton: boolean;
}

/**
 * Target untuk return dropdown
 */
export interface ReturnTargetOption {
  role: string;
  name: string;
  available: boolean;
}

/**
 * Route options untuk kategori UMUM
 */
export interface RouteOption {
  value: 'WADEK_1' | 'WADEK_2' | 'BOTH';
  label: string;
  description: string;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Filter untuk dashboard leadership
 */
export interface LeadershipFilter {
  category?: LetterCategory;
  needsAction?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get next verifier based on current role and category
 */
export function getNextVerifier(
  currentRole: string,
  category: LetterCategory,
  umumRoute?: 'WADEK_1' | 'WADEK_2' | 'BOTH'
): string | null {
  let route: readonly string[];

  if (category === 'UMUM') {
    if (umumRoute === 'WADEK_1') {
      route = VERIFICATION_ROUTES.UMUM_WADEK_1;
    } else if (umumRoute === 'WADEK_2') {
      route = VERIFICATION_ROUTES.UMUM_WADEK_2;
    } else {
      route = VERIFICATION_ROUTES.UMUM_BOTH;
    }
  } else {
    route = VERIFICATION_ROUTES[category as keyof typeof VERIFICATION_ROUTES] || [];
  }

  const currentIndex = route.indexOf(currentRole);
  if (currentIndex === -1 || currentIndex >= route.length - 1) return null;

  return route[currentIndex + 1];
}

/**
 * Check if role is final verifier (Dekan)
 */
export function isFinalVerifier(role: string): boolean {
  return role === 'DEKAN';
}

/**
 * Check if role should sign document
 */
export function shouldSign(role: string, signerRoles: string[]): boolean {
  return signerRoles.includes(role);
}

/**
 * Get return targets for role
 */
export function getReturnTargets(role: string): string[] {
  return RETURN_TARGETS[role] || [];
}
