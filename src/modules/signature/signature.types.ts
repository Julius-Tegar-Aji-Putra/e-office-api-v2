/**
 * Signature Module Types
 * Types untuk manajemen tanda tangan personal user
 * 
 * Note: Modul ini hanya untuk manage saved signatures personal user
 * Untuk proses signing dokumen, gunakan hasil.service.ts -> signDocument()
 */

import type { SignatureType } from '../../generated/prisma/enums';

// ============================================================================
// Input Types (Request Body)
// ============================================================================

/**
 * Method untuk upload tanda tangan
 */
export type SignatureUploadMethod = 'UPLOAD' | 'CANVAS';

/**
 * DTO untuk upload signature baru
 */
export interface UploadSignatureDTO {
  method: SignatureUploadMethod;
  alias?: string; // Nama TTD (misal: "TTD Formal", "TTD Resmi")
}

/**
 * DTO untuk update signature (hanya alias)
 */
export interface UpdateSignatureDTO {
  alias?: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response item saved signature
 */
export interface SavedSignatureItem {
  id: string;
  type: SignatureType;
  fileUrl: string;
  fileName: string;
  alias: string | null;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Response list saved signatures
 */
export interface SavedSignatureListResponse {
  data: SavedSignatureItem[];
  total: number;
}

/**
 * Response upload signature
 */
export interface UploadSignatureResponse {
  id: string;
  fileUrl: string;
  fileName: string;
  alias: string | null;
  type: SignatureType;
  message: string;
}

/**
 * Response delete signature
 */
export interface DeleteSignatureResponse {
  success: boolean;
  message: string;
}

// ============================================================================
// Signing Process Types (untuk hasil.service.ts)
// ============================================================================

/**
 * Method untuk menandatangani dokumen
 */
export type SigningMethod = 'UPLOAD' | 'CANVAS' | 'SAVED';

/**
 * DTO untuk proses penandatanganan dokumen
 */
export interface SignDocumentDTO {
  method: SigningMethod;
  savedSignatureId?: string; // Jika method = SAVED
  saveAsTemplate?: boolean; // Simpan sebagai template baru
  templateAlias?: string; // Nama jika simpan sebagai template
}

/**
 * Response sign document
 */
export interface SignDocumentResponse {
  documentId: string;
  signatureId: string;
  signatureUrl: string;
  status: 'SIGNED';
  signedAt: Date;
  message: string;
}

// ============================================================================
// Permission Types
// ============================================================================

/**
 * Roles yang diizinkan untuk menandatangani
 */
export const SIGNING_ROLES = [
  'KAPRODI',
  'KADEP',
  'DEKAN',
  'WAKIL_DEKAN_1',
  'WAKIL_DEKAN_2',
] as const;

export type SigningRole = typeof SIGNING_ROLES[number];

/**
 * Check if role can sign
 */
export function canSign(role: string): boolean {
  return (SIGNING_ROLES as readonly string[]).includes(role);
}
