/**
 * Profile Validation Schemas
 * Typebox schemas untuk Elysia route validation
 */

import { t } from 'elysia';

// ============================================================================
// Update Profile Schema
// ============================================================================

export const updateProfileSchema = t.Object({
  name: t.Optional(t.String({ minLength: 2, error: 'Nama minimal 2 karakter' })),
  email: t.Optional(t.String({ format: 'email', error: 'Format email tidak valid' })),
  noHp: t.Optional(t.String()),
  // Mahasiswa
  nim: t.Optional(t.String()),
  tahunMasuk: t.Optional(t.String()),
  // Pegawai
  nip: t.Optional(t.String()),
  jabatan: t.Optional(t.String()),
  // Dept/Prodi
  departemenId: t.Optional(t.String()),
  programStudiId: t.Optional(t.String()),
});

// ============================================================================
// Change Password Schema
// ============================================================================

export const changePasswordSchema = t.Object({
  oldPassword: t.String({ minLength: 1, error: 'Password lama wajib diisi' }),
  newPassword: t.String({ minLength: 8, maxLength: 32, error: 'Password baru minimal 8 karakter, maksimal 32 karakter' }),
  confirmPassword: t.String({ minLength: 1, error: 'Konfirmasi password wajib diisi' }),
});

// ============================================================================
// Avatar Upload Schema
// ============================================================================

export const uploadAvatarSchema = t.Object({
  file: t.File({
    error: 'File foto profil wajib diupload',
  }),
});

// ============================================================================
// Avatar validation constants
// ============================================================================

export const AVATAR_UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_MIME_TYPES: ['image/png', 'image/jpeg', 'image/jpg'] as const,
};

/**
 * Validate avatar file
 */
export function validateAvatarFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'File wajib diupload' };
  }

  if (!AVATAR_UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(file.type as any)) {
    return { valid: false, error: 'Format file tidak didukung. Gunakan PNG atau JPG.' };
  }

  if (file.size > AVATAR_UPLOAD_CONFIG.MAX_FILE_SIZE) {
    return { valid: false, error: 'Ukuran file maksimal 5MB' };
  }

  return { valid: true };
}
