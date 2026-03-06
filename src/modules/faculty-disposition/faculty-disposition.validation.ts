/**
 * Faculty Disposition Validation Schemas
 */

import { t } from 'elysia';

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const dispositionQuerySchema = t.Object({
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

export const roleParamSchema = t.Object({
  role: t.String({ minLength: 1 })
});

// ============================================================================
// BODY SCHEMAS
// ============================================================================

export const categorizeBodySchema = t.Object({
  category: t.Union([
    t.Literal('AKADEMIK'),
    t.Literal('SUMBER_DAYA'),
    t.Literal('UMUM')
  ], { error: 'Kategori harus AKADEMIK, SUMBER_DAYA, atau UMUM' })
});

export const forwardBodySchema = t.Object({
  targetRole: t.String({ minLength: 1, error: 'Target role wajib diisi' }),
  targetUserId: t.Optional(t.String({ minLength: 1 })),
  notes: t.Optional(t.String())
});

export const completeBodySchema = t.Object({
  notes: t.String({ minLength: 1, error: 'Catatan wajib diisi' })
});

export const returnBodySchema = t.Object({
  targetRole: t.String({ minLength: 1, error: 'Target role wajib diisi' }),
  targetUserId: t.Optional(t.String({ minLength: 1 })),
  reason: t.String({ minLength: 1, error: 'Alasan pengembalian wajib diisi' })
});
