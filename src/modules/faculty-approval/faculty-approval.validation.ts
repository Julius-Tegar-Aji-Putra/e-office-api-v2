/**
 * Faculty Approval Validation Schemas
 */

import { t } from 'elysia';

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const facultyApprovalQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 10 })),
  status: t.Optional(t.String()),
  category: t.Optional(t.Union([
    t.Literal('AKADEMIK'),
    t.Literal('SUMBER_DAYA'),
    t.Literal('UMUM')
  ])),
  search: t.Optional(t.String())
});

// ============================================================================
// PARAM SCHEMAS
// ============================================================================

export const letterIdParamSchema = t.Object({
  id: t.String({ minLength: 1 })
});

export const documentIdParamSchema = t.Object({
  documentId: t.String({ minLength: 1 })
});

// ============================================================================
// BODY SCHEMAS
// ============================================================================

export const verifyBodySchema = t.Object({
  notes: t.Optional(t.String())
  // Routing otomatis berdasarkan jenis surat & konfigurasi TTD
  // Tidak ada pilihan manual
});

export const signBodySchema = t.Object({
  // Base64 image data (from canvas drawing or file upload)
  signatureData: t.Optional(t.String({ minLength: 1 })),
  // URL to signature image (from saved signatures)
  signatureUrl: t.Optional(t.String({ minLength: 1 })),
  signerName: t.Optional(t.String()),
  signerNip: t.Optional(t.String()),
  notes: t.Optional(t.String()),
  // Save signature to user's saved signatures
  saveSignature: t.Optional(t.Boolean({ default: false }))
});

export const returnBodySchema = t.Object({
  targetRole: t.String({ minLength: 1, error: 'Target role wajib diisi' }),
  reason: t.String({ minLength: 1, error: 'Alasan pengembalian wajib diisi' }),
  targetUserId: t.Optional(t.String({ minLength: 1 }))
});

export const updateDraftBodySchema = t.Object({
  content: t.Record(t.String(), t.Any())
});
