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
  order: t.Number({ minimum: 0 })
});

export const saveDraftBodySchema = t.Object({
  content: t.Record(t.String(), t.Any()),
  tembusan: t.Optional(t.Array(t.String())),
  signatories: t.Array(signatorySchema, { minItems: 1, error: 'Minimal satu penandatangan' })
});

export const signBodySchema = t.Object({
  signatureUrl: t.String({ minLength: 1, error: 'URL tanda tangan wajib diisi' }),
  signerName: t.String({ minLength: 1, error: 'Nama penandatangan wajib diisi' }),
  signerNip: t.Optional(t.String())
});
