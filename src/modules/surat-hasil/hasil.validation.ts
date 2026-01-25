/**
 * Surat Hasil Validation Schemas
 */

import { t } from 'elysia';

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const hasilQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 10 })),
  status: t.Optional(t.String()),
  documentType: t.Optional(t.Union([
    t.Literal('SURAT_TUGAS'),
    t.Literal('SURAT_KEPUTUSAN')
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

export const signatorySchema = t.Object({
  signerRole: t.String({ minLength: 1 }),
  signerName: t.String({ minLength: 1 }),
  signerNip: t.Optional(t.String()),
  order: t.Number({ minimum: 0 })
});

export const createDraftBodySchema = t.Object({
  documentType: t.Union([
    t.Literal('SURAT_TUGAS'),
    t.Literal('SURAT_KEPUTUSAN')
  ], { error: 'Tipe dokumen harus SURAT_TUGAS atau SURAT_KEPUTUSAN' }),
  content: t.Record(t.String(), t.Any()),
  tembusan: t.Optional(t.Array(t.String())),
  perihal: t.Optional(t.String()),
  signatories: t.Array(signatorySchema, { minItems: 1, error: 'Minimal satu penandatangan' })
});

export const updateDraftBodySchema = t.Object({
  content: t.Optional(t.Record(t.String(), t.Any())),
  tembusan: t.Optional(t.Array(t.String())),
  perihal: t.Optional(t.String())
});

export const submitVerificationBodySchema = t.Object({
  targetSupervisor: t.Optional(t.Union([
    t.Literal('AKADEMIK'),
    t.Literal('SUMBER_DAYA')
  ]))
});

// Supervisor approval
export const approveVerificationBodySchema = t.Object({
  notes: t.Optional(t.String())
});

// Supervisor return for revision
export const returnRevisionBodySchema = t.Object({
  reason: t.String({ minLength: 1, error: 'Alasan pengembalian wajib diisi' })
});

// Sign document (Dekan/Wadek)
export const signDocumentBodySchema = t.Object({
  signatureUrl: t.String({ minLength: 1, error: 'URL tanda tangan wajib diisi' }),
  signerName: t.String({ minLength: 1, error: 'Nama penandatangan wajib diisi' }),
  signerNip: t.Optional(t.String())
});
