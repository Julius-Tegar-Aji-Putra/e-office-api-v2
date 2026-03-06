/**
 * Admin Management Validation Schemas
 * Typebox schemas untuk Elysia route validation
 */

import { t } from 'elysia';

export const createUserSchema = t.Object({
  name: t.String({ minLength: 2, error: 'Nama minimal 2 karakter' }),
  email: t.String({ format: 'email', error: 'Format email tidak valid' }),
  role: t.String({ minLength: 1, error: 'Role wajib dipilih' }),
  password: t.Optional(t.String({ minLength: 8, maxLength: 32 })),
  // Mahasiswa
  nim: t.Optional(t.String()),
  tahunMasuk: t.Optional(t.String()),
  noHp: t.Optional(t.String()),
  // Pegawai
  nip: t.Optional(t.String()),
  jabatan: t.Optional(t.String()),
  // Common
  departemenId: t.Optional(t.String()),
  programStudiId: t.Optional(t.String()),
});

export const updateUserSchema = t.Object({
  name: t.Optional(t.String({ minLength: 2, error: 'Nama minimal 2 karakter' })),
  email: t.Optional(t.String({ format: 'email', error: 'Format email tidak valid' })),
  role: t.Optional(t.String()),
  nim: t.Optional(t.String()),
  tahunMasuk: t.Optional(t.String()),
  noHp: t.Optional(t.String()),
  nip: t.Optional(t.String()),
  jabatan: t.Optional(t.String()),
  departemenId: t.Optional(t.String()),
  programStudiId: t.Optional(t.String()),
});

export const userIdParamSchema = t.Object({
  id: t.String({ minLength: 1, error: 'User ID wajib' }),
});

export const userQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 10 })),
  search: t.Optional(t.String()),
  role: t.Optional(t.String()),
  status: t.Optional(t.String()),
});
