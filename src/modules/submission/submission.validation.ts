/**
 * Submission Validation Schemas
 * Validation menggunakan Typebox untuk Elysia
 */

import { t } from 'elysia';

// ============================================================================
// Form Data Schema
// ============================================================================

export const submissionFormDataSchema = t.Object({
  // Data Diri
  nama: t.String({ minLength: 2, error: 'Nama minimal 2 karakter' }),
  nim: t.Optional(t.String()),
  nip: t.Optional(t.String()),
  email: t.String({ format: 'email', error: 'Email tidak valid' }),
  noHp: t.String({ minLength: 10, error: 'Nomor HP minimal 10 digit' }),
  departemen: t.String({ minLength: 1, error: 'Departemen wajib diisi' }),
  programStudi: t.String({ minLength: 1, error: 'Program Studi wajib diisi' }),

  // Detail Surat
  jenisSurat: t.Union([t.Literal('SURAT_TUGAS'), t.Literal('SURAT_KEPUTUSAN')], {
    error: 'Jenis surat harus SURAT_TUGAS atau SURAT_KEPUTUSAN',
  }),
  keperluan: t.String({ minLength: 10, error: 'Keperluan minimal 10 karakter' }),
  judulAcara: t.String({ minLength: 5, error: 'Judul acara minimal 5 karakter' }),
  tanggalAcara: t.String({ error: 'Tanggal acara wajib diisi' }),
  tanggalSelesai: t.Optional(t.String()),
  durasiAcara: t.Optional(t.String()),
  lokasiAcara: t.String({ minLength: 3, error: 'Lokasi acara minimal 3 karakter' }),

  // Konfigurasi TTD
  butuhTtdKadep: t.Boolean({ default: false }),

  // Catatan tambahan
  catatan: t.Optional(t.String()),
});

// ============================================================================
// Signature Config Schema
// ============================================================================

export const signatureConfigSchema = t.Object({
  targetSigner: t.Union([t.Literal('DEKAN'), t.Literal('WADEK_1'), t.Literal('WADEK_2')], {
    error: 'Target penandatangan harus DEKAN, WADEK_1, atau WADEK_2',
  }),
  requestKadepSign: t.Boolean({ default: false }),
  requestWadekSign: t.Optional(t.Boolean()),
});

// ============================================================================
// Create Submission Schema
// ============================================================================

export const createSubmissionSchema = t.Object({
  letterTypeId: t.String({ minLength: 1, error: 'ID jenis surat wajib diisi' }),
  formData: submissionFormDataSchema,
  signatureConfig: signatureConfigSchema,
});

// ============================================================================
// Update Submission Schema (untuk revisi)
// ============================================================================

export const updateSubmissionSchema = t.Partial(
  t.Object({
    formData: t.Partial(submissionFormDataSchema),
    signatureConfig: t.Partial(signatureConfigSchema),
  })
);

// ============================================================================
// Query Params Schema
// ============================================================================

export const submissionQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 10 })),
  status: t.Optional(t.String()),
  letterTypeId: t.Optional(t.String()),
  category: t.Optional(
    t.Union([t.Literal('AKADEMIK'), t.Literal('SUMBER_DAYA'), t.Literal('UMUM')])
  ),
  search: t.Optional(t.String()),
  dateFrom: t.Optional(t.String()),
  dateTo: t.Optional(t.String()),
  sortBy: t.Optional(
    t.Union([t.Literal('submittedAt'), t.Literal('status'), t.Literal('judulSurat')])
  ),
  sortOrder: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
});

// ============================================================================
// Path Params Schema
// ============================================================================

export const submissionIdParamSchema = t.Object({
  id: t.String({ minLength: 1, error: 'ID submission wajib diisi' }),
});

// ============================================================================
// Cancel/Resubmit Schema
// ============================================================================

export const cancelSubmissionSchema = t.Object({
  alasan: t.Optional(t.String()),
});

export const resubmitSchema = t.Object({
  formData: submissionFormDataSchema,
  signatureConfig: signatureConfigSchema,
});
