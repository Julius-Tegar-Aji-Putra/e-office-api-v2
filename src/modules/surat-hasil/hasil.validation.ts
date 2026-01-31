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
    t.Literal('SURAT_KEPUTUSAN'),
    t.Literal('SURAT_PENGANTAR'),
    t.Literal('SURAT_TUGAS_TABEL')
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
  order: t.Number({ minimum: 0 }),
  // Position data for signature placement on PDF
  x: t.Optional(t.Number()),
  y: t.Optional(t.Number()),
  page: t.Optional(t.Number({ minimum: 1 }))
});

// Tembusan recipient schema (new format with userId)
export const tembusanRecipientSchema = t.Object({
  userId: t.String({ minLength: 1 }),
  name: t.String({ minLength: 1 }),
  description: t.Optional(t.String())
});

export const createDraftBodySchema = t.Object({
  documentType: t.Union([
    t.Literal('SURAT_TUGAS'),
    t.Literal('SURAT_KEPUTUSAN'),
    t.Literal('SURAT_PENGANTAR'),
    t.Literal('SURAT_TUGAS_TABEL')
  ], { error: 'Tipe dokumen harus SURAT_TUGAS, SURAT_KEPUTUSAN, SURAT_PENGANTAR, atau SURAT_TUGAS_TABEL' }),
  content: t.Record(t.String(), t.Any()),
  // Tembusan now supports both old format (string[]) and new format (TembusanRecipient[])
  tembusan: t.Optional(t.Union([
    t.Array(t.String()),
    t.Array(tembusanRecipientSchema)
  ])),
  perihal: t.Optional(t.String()),
  signatories: t.Array(signatorySchema, { minItems: 1, error: 'Minimal satu penandatangan' })
});

export const updateDraftBodySchema = t.Object({
  content: t.Optional(t.Record(t.String(), t.Any())),
  // Tembusan now supports both old format (string[]) and new format (TembusanRecipient[])
  tembusan: t.Optional(t.Union([
    t.Array(t.String()),
    t.Array(tembusanRecipientSchema)
  ])),
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
// Supports two modes:
// 1. signatureData (base64) - For new signatures from canvas/upload
// 2. signatureUrl - For using saved signatures (legacy support)
export const signDocumentBodySchema = t.Object({
  // Base64 image data (from canvas drawing or file upload)
  signatureData: t.Optional(t.String({ minLength: 1 })),
  // Legacy: URL to signature image (for backward compatibility)
  signatureUrl: t.Optional(t.String({ minLength: 1 })),
  // Signer information (auto-filled from user if not provided)
  signerName: t.Optional(t.String()),
  signerNip: t.Optional(t.String()),
  // Save signature to user's saved signatures
  saveSignature: t.Optional(t.Boolean({ default: false }))
});

// ============================================================================
// CREATE STAFF SURAT (tanpa submission)
// ============================================================================

export const createStaffSuratBodySchema = t.Object({
  // Kategori surat: AKADEMIK atau SUMBER_DAYA
  category: t.Union([
    t.Literal('AKADEMIK'),
    t.Literal('SUMBER_DAYA')
  ], { error: 'Kategori harus AKADEMIK atau SUMBER_DAYA' }),
  
  // Tipe dokumen
  documentType: t.Union([
    t.Literal('SURAT_TUGAS'),
    t.Literal('SURAT_KEPUTUSAN'),
    t.Literal('SURAT_TUGAS_TABEL')
  ], { error: 'Tipe dokumen harus SURAT_TUGAS, SURAT_KEPUTUSAN, atau SURAT_TUGAS_TABEL' }),
  
  // Konten surat sesuai tipe
  content: t.Record(t.String(), t.Any()),
  
  // Tembusan - supports both old format (string[]) and new format (TembusanRecipient[])
  tembusan: t.Optional(t.Union([
    t.Array(t.String()),
    t.Array(tembusanRecipientSchema)
  ])),
  
  // Perihal surat
  perihal: t.Optional(t.String()),
  
  // Penandatangan
  signatories: t.Array(signatorySchema, { minItems: 1, error: 'Minimal satu penandatangan' })
});
