/**
 * Legalisasi Validation Schemas
 * Typebox schemas untuk request validation
 */

import { t } from 'elysia';

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const legalisasiQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  status: t.Optional(t.Union([
    t.Literal('UPA_NUMBERING'),
    t.Literal('UPA_STAMPING'),
    t.Literal('UPA_FINALIZING')
  ])),
  search: t.Optional(t.String())
});

// ============================================================================
// PATH PARAMS SCHEMAS
// ============================================================================

export const idParamSchema = t.Object({
  id: t.String({ minLength: 1 })
});

export const documentTypeParamSchema = t.Object({
  type: t.Union([
    t.Literal('SURAT_PENGANTAR'),
    t.Literal('SURAT_TUGAS'),
    t.Literal('SURAT_KEPUTUSAN')
  ])
});

// ============================================================================
// BODY SCHEMAS
// ============================================================================

export const assignNumberSchema = t.Object({
  nomorSurat: t.String({ 
    minLength: 1,
    description: 'Nomor surat resmi (format sesuai ketentuan fakultas)'
  }),
  tanggalSurat: t.String({
    format: 'date',
    description: 'Tanggal surat (YYYY-MM-DD)'
  })
});

export const finalizeDocumentSchema = t.Object({
  qrCodeUrl: t.String({
    minLength: 1,
    description: 'URL ke QR code untuk verifikasi'
  }),
  fileUrl: t.String({
    minLength: 1,
    description: 'URL ke file PDF final'
  })
});

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

export const letterListResponseSchema = t.Object({
  success: t.Boolean(),
  data: t.Optional(t.Object({
    data: t.Array(t.Any()),
    total: t.Number(),
    page: t.Number(),
    limit: t.Number(),
    totalPages: t.Number()
  })),
  error: t.Optional(t.String())
});

export const letterDetailResponseSchema = t.Object({
  success: t.Boolean(),
  data: t.Optional(t.Any()),
  error: t.Optional(t.String())
});

export const recentNumbersResponseSchema = t.Object({
  success: t.Boolean(),
  data: t.Optional(t.Array(t.Object({
    nomorSurat: t.Nullable(t.String()),
    tanggalSurat: t.Nullable(t.String()),
    letterInstance: t.Object({
      letterType: t.Object({
        name: t.String(),
        code: t.String()
      })
    })
  }))),
  error: t.Optional(t.String())
});

export const tembusanResponseSchema = t.Object({
  success: t.Boolean(),
  data: t.Optional(t.Array(t.Object({
    id: t.String(),
    name: t.String(),
    email: t.Nullable(t.String())
  }))),
  error: t.Optional(t.String())
});

export const errorResponseSchema = t.Object({
  success: t.Literal(false),
  error: t.String()
});
