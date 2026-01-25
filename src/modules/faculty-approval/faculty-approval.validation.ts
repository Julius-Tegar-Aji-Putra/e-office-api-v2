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
  signatureUrl: t.String({ minLength: 1, error: 'URL tanda tangan wajib diisi' }),
  signerName: t.String({ minLength: 1, error: 'Nama penandatangan wajib diisi' }),
  signerNip: t.Optional(t.String()),
  notes: t.Optional(t.String())
});

export const returnBodySchema = t.Object({
  targetRole: t.String({ minLength: 1, error: 'Target role wajib diisi' }),
  reason: t.String({ minLength: 1, error: 'Alasan pengembalian wajib diisi' })
});

export const updateDraftBodySchema = t.Object({
  content: t.Record(t.String(), t.Any())
});
