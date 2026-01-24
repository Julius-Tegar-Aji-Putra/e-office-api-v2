/**
 * Signing Validation Schemas
 * Typebox schemas untuk validasi endpoint signing
 */

import { t } from 'elysia';

// ============================================================================
// Signing Method Enum
// ============================================================================

export const signingMethodSchema = t.Union([
  t.Literal('UPLOAD'),
  t.Literal('CANVAS'),
  t.Literal('SAVED'),
]);

// ============================================================================
// Tembusan Schema
// ============================================================================

export const tembusanItemSchema = t.Object({
  type: t.Union([t.Literal('TEXT'), t.Literal('USER')]),
  value: t.String({ minLength: 1 }),
  label: t.Optional(t.String()),
});

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * Sign document request body
 */
export const signDocumentSchema = t.Object({
  signatureId: t.String({ minLength: 1 }),
  letterInstanceId: t.String({ minLength: 1 }),
  method: signingMethodSchema,
  savedSignatureId: t.Optional(t.String()),
  signatureFile: t.Optional(t.File()),
  saveAsTemplate: t.Optional(t.Boolean()),
  templateAlias: t.Optional(t.String()),
});

/**
 * Generate draft request body
 */
export const generateDraftSchema = t.Object({
  letterInstanceId: t.String({ minLength: 1 }),
  templateHtml: t.String({ minLength: 1 }),
  variables: t.Record(t.String(), t.Unknown()),
  tembusan: t.Optional(t.Array(tembusanItemSchema)),
});

/**
 * Query params for pending signatures
 */
export const pendingSignaturesQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
});

// ============================================================================
// Validation Config
// ============================================================================

/**
 * Allowed MIME types for signature upload
 */
export const SIGNATURE_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

/**
 * Max signature file size (2MB)
 */
export const SIGNATURE_MAX_SIZE = 2 * 1024 * 1024;

/**
 * Validate signature file
 */
export function validateSignatureFileForSigning(
  file: File | undefined
): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: true }; // File is optional for some methods
  }

  if (!SIGNATURE_ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Format file tidak didukung. Gunakan: ${SIGNATURE_ALLOWED_TYPES.join(', ')}`,
    };
  }

  if (file.size > SIGNATURE_MAX_SIZE) {
    return {
      valid: false,
      error: `Ukuran file melebihi batas maksimal ${SIGNATURE_MAX_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
}
