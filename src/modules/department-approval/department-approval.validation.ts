/**
 * Department Approval Validation Schemas
 * Typebox schemas untuk validasi request
 */

import { t } from 'elysia';

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const departmentApprovalQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 10 })),
  status: t.Optional(t.String()),
  search: t.Optional(t.String())
});

// ============================================================================
// PARAM SCHEMAS
// ============================================================================

export const letterIdParamSchema = t.Object({
  id: t.String({ minLength: 1 })
});

// ============================================================================
// BODY SCHEMAS
// ============================================================================

export const approveBodySchema = t.Object({
  notes: t.Optional(t.String())
});

export const rejectBodySchema = t.Object({
  reason: t.String({ minLength: 1, error: 'Alasan penolakan wajib diisi' })
});

export const signatorySchema = t.Object({
  signerRole: t.String({ minLength: 1 }),
  signerName: t.String({ minLength: 1 }),
  signerNip: t.Optional(t.String()),
  order: t.Number({ minimum: 0 }),
  // Position data for signature placement on PDF
  x: t.Optional(t.Number()),
  y: t.Optional(t.Number()),
  page: t.Optional(t.Number({ minimum: 1 }))
});

export const saveDraftBodySchema = t.Object({
  content: t.Record(t.String(), t.Any()),
  tembusan: t.Optional(t.Array(t.String())),
  signatories: t.Array(signatorySchema, { minItems: 1, error: 'Minimal satu penandatangan' })
});

export const signBodySchema = t.Object({
  // Support both new format (base64 or saved signature) and legacy format
  signatureData: t.Optional(t.String()), // base64 data dari handwriting/upload
  signatureUrl: t.Optional(t.String()), // URL dari saved signature
  saveSignature: t.Optional(t.Boolean()), // Save untuk penggunaan berikutnya
  signerName: t.Optional(t.String()),
  signerNip: t.Optional(t.String())
}, {
  minProperties: 1, // Minimal ada satu dari signatureData atau signatureUrl
  error: 'Tanda tangan (signatureData atau signatureUrl) wajib diisi'
});
