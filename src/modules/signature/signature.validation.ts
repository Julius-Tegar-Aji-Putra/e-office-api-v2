/**
 * Signature Validation Schemas
 * Validation menggunakan Typebox untuk Elysia
 */

import { t } from 'elysia';

// ============================================================================
// File Upload Constants
// ============================================================================

export const SIGNATURE_UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 2 * 1024 * 1024, // 2MB
  ALLOWED_MIME_TYPES: [
    'image/png',
    'image/jpeg',
    'image/jpg',
  ] as const,
  ALLOWED_EXTENSIONS: ['.png', '.jpg', '.jpeg'] as const,
};

// ============================================================================
// Upload Signature Schema (Multipart)
// ============================================================================

export const uploadSignatureSchema = t.Object({
  file: t.File({
    error: 'File tanda tangan wajib diupload',
  }),
  method: t.Union([t.Literal('UPLOAD'), t.Literal('CANVAS')], {
    error: 'Method harus UPLOAD atau CANVAS',
    default: 'UPLOAD',
  }),
  alias: t.Optional(t.String({ maxLength: 100 })),
});

// ============================================================================
// Update Signature Schema
// ============================================================================

export const updateSignatureSchema = t.Object({
  alias: t.Optional(t.String({ maxLength: 100 })),
});

// ============================================================================
// Signature ID Param Schema
// ============================================================================

export const signatureIdParamSchema = t.Object({
  id: t.String({ minLength: 1, error: 'ID signature wajib diisi' }),
});

// ============================================================================
// Sign Document Schema (untuk hasil module)
// ============================================================================

export const signDocumentSchema = t.Object({
  method: t.Union([
    t.Literal('UPLOAD'),
    t.Literal('CANVAS'),
    t.Literal('SAVED'),
  ], {
    error: 'Method harus UPLOAD, CANVAS, atau SAVED',
  }),
  savedSignatureId: t.Optional(t.String()),
  saveAsTemplate: t.Optional(t.Boolean({ default: false })),
  templateAlias: t.Optional(t.String({ maxLength: 100 })),
});

// ============================================================================
// File Validation Helper
// ============================================================================

export function validateSignatureFile(file: File): { valid: boolean; error?: string } {
  if (file.size > SIGNATURE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File terlalu besar. Maksimal ${SIGNATURE_UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  const mimeType = file.type.toLowerCase();
  if (!SIGNATURE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    return {
      valid: false,
      error: 'Format file tidak didukung. Hanya PNG dan JPG yang diperbolehkan',
    };
  }

  return { valid: true };
}
