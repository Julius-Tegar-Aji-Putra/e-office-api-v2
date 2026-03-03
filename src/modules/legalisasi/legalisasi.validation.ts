/**
 * Legalisasi Validation Schemas
 * Typebox schemas untuk request validation
 */

import { t } from 'elysia';

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const legalisasiQueueQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  status: t.Optional(t.Union([
    t.Literal('UPA_NUMBERING'),
    t.Literal('UPA_STAMPING'),
    t.Literal('UPA_FINALIZING'),
    t.Literal('COMPLETED')
  ])),
  legalisasiStatus: t.Optional(t.Union([
    t.Literal('PENDING'),
    t.Literal('NOMOR_DIBERIKAN'),
    t.Literal('STEMPEL_DIBERIKAN'),
    t.Literal('QR_GENERATED'),
    t.Literal('COMPLETED')
  ])),
  kategori: t.Optional(t.Union([
    t.Literal('AKADEMIK'),
    t.Literal('SUMBER_DAYA'),
    t.Literal('UMUM')
  ])),
  search: t.Optional(t.String())
});

export const usedNumbersQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
  year: t.Optional(t.String()),
  search: t.Optional(t.String())
});

// ============================================================================
// PATH PARAMS SCHEMAS
// ============================================================================

export const idParamSchema = t.Object({
  id: t.String({ minLength: 1 })
});

export const documentIdParamSchema = t.Object({
  documentId: t.String({ minLength: 1 })
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
    description: 'Nomor surat resmi (format: XXX/UN7.5/ST/I/2026)'
  }),
  tanggalSurat: t.String({
    description: 'Tanggal surat (YYYY-MM-DD)'
  }),
  position: t.Optional(t.Object({
    x: t.Number({ description: 'X coordinate for number position' }),
    y: t.Number({ description: 'Y coordinate for number position' }),
    page: t.Number({ description: 'Page number (1-based)' }),
    fontSize: t.Number({ description: 'Font size for number text' })
  }))
});

export const applyStempelSchema = t.Object({
  sealImageUrl: t.Optional(t.String({
    description: 'URL gambar stempel custom (opsional, akan pakai default jika tidak ada)'
  })),
  sealTargetRole: t.Optional(t.String({
    description: 'Role pejabat yang dipilih UPA untuk menerima stempel'
  })),
  position: t.Optional(t.Object({
    x: t.Number(),
    y: t.Number(),
    width: t.Optional(t.Number()),
    height: t.Optional(t.Number()),
    page: t.Optional(t.Number())
  }))
});

export const finalizeDocumentSchema = t.Object({
  fileUrl: t.String({
    minLength: 1,
    description: 'URL ke file PDF final'
  }),
  notes: t.Optional(t.String({
    description: 'Catatan tambahan'
  }))
});

export const checkNumberSchema = t.Object({
  nomorSurat: t.String({
    minLength: 1,
    description: 'Nomor surat yang akan dicek'
  })
});

// ============================================================================
// VERIFICATION SCHEMAS (Public)
// ============================================================================

export const verifyTokenQuerySchema = t.Object({
  token: t.String({
    minLength: 1,
    description: 'Encrypted verification token dari QR Code'
  })
});

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

export const queueResponseSchema = t.Object({
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

export const usedNumbersResponseSchema = t.Object({
  success: t.Boolean(),
  data: t.Optional(t.Object({
    data: t.Array(t.Object({
      nomorSurat: t.String(),
      tanggalSurat: t.Nullable(t.String()),
      perihal: t.Nullable(t.String()),
      letterType: t.String(),
      createdAt: t.String()
    })),
    total: t.Number(),
    page: t.Number(),
    limit: t.Number(),
    totalPages: t.Number()
  })),
  error: t.Optional(t.String())
});

export const checkNumberResponseSchema = t.Object({
  success: t.Boolean(),
  data: t.Optional(t.Object({
    isAvailable: t.Boolean(),
    existingDocument: t.Optional(t.Object({
      perihal: t.Nullable(t.String()),
      tanggalSurat: t.Nullable(t.String()),
      letterType: t.String()
    })),
    suggestion: t.Optional(t.String())
  })),
  error: t.Optional(t.String())
});

export const qrCodeResponseSchema = t.Object({
  success: t.Boolean(),
  data: t.Optional(t.Object({
    qrCodeBase64: t.String(),
    qrCodeDataUrl: t.String(),
    verificationUrl: t.String()
  })),
  error: t.Optional(t.String())
});

export const verificationResponseSchema = t.Object({
  valid: t.Boolean(),
  status: t.Union([
    t.Literal('VERIFIED'),
    t.Literal('NOT_FOUND'),
    t.Literal('INVALID_TOKEN'),
    t.Literal('EXPIRED')
  ]),
  message: t.String(),
  data: t.Optional(t.Object({
    nomorSurat: t.String(),
    tanggalSurat: t.String(),
    perihal: t.String(),
    jenisDocument: t.String(),
    penandatangan: t.Array(t.Object({
      nama: t.String(),
      jabatan: t.String()
    })),
    pemohon: t.Optional(t.Object({
      nama: t.String(),
      nim: t.Optional(t.String())
    })),
    dibuatPada: t.String()
  }))
});

export const errorResponseSchema = t.Object({
  success: t.Literal(false),
  error: t.String()
});
