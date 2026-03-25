/**
 * Profile Routes
 * Elysia routes untuk self-service profile management
 * Prefix: /profile
 */

import { Elysia } from 'elysia';
import { authGuardPlugin } from '../../middlewares/auth';
import { profileService } from './profile.service';
import {
  updateProfileSchema,
  changePasswordSchema,
  uploadAvatarSchema,
  validateAvatarFile,
} from './profile.validation';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http-status';

export const profileRoutes = new Elysia({ prefix: '/profile' })
  .use(authGuardPlugin)

  // ========== GET MY PROFILE ==========
  .get('/me', async ({ user }) => {
    try {
      const result = await profileService.getMyProfile(user.id);
      return {
        success: true,
        message: 'Berhasil mengambil profil',
        data: result,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal mengambil profil',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }, {
    detail: {
      summary: 'Get my profile',
      description: 'Mengambil data profil user yang sedang login',
      tags: ['Profile'],
    },
  })

  // ========== UPDATE MY PROFILE ==========
  .put('/me', async ({ user, body }) => {
    try {
      const result = await profileService.updateProfile(user.id, body);
      return {
        success: true,
        message: result.message,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal memperbarui profil',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }, {
    body: updateProfileSchema,
    detail: {
      summary: 'Update my profile',
      description: 'Memperbarui data profil user yang sedang login',
      tags: ['Profile'],
    },
  })

  // ========== CHANGE PASSWORD ==========
  .put('/me/password', async ({ user, body }) => {
    try {
      const result = await profileService.changePassword(user.id, body);
      return {
        success: true,
        message: result.message,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal mengubah password',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }, {
    body: changePasswordSchema,
    detail: {
      summary: 'Change password',
      description: 'Mengubah password user (validasi password lama terlebih dahulu)',
      tags: ['Profile'],
    },
  })

  // ========== UPLOAD AVATAR ==========
  .post('/me/avatar', async ({ user, body }) => {
    try {
      const { file } = body as { file: File };

      // Validate avatar file
      const validation = validateAvatarFile(file);
      if (!validation.valid) {
        throw new AppError(validation.error!, HTTP_STATUS.BAD_REQUEST);
      }

      const result = await profileService.uploadAvatar(user.id, file);
      return {
        success: true,
        message: result.message,
        data: { image: result.image },
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal mengunggah foto profil',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }, {
    body: uploadAvatarSchema,
    type: 'multipart/formdata',
    detail: {
      summary: 'Upload avatar',
      description: 'Mengunggah foto profil baru (PNG/JPG, maks 5MB)',
      tags: ['Profile'],
    },
  })

  // ========== DELETE AVATAR ==========
  .delete('/me/avatar', async ({ user }) => {
    try {
      const result = await profileService.deleteAvatar(user.id);
      return {
        success: true,
        message: result.message,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal menghapus foto profil',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }, {
    detail: {
      summary: 'Delete avatar',
      description: 'Menghapus foto profil (kembali ke default)',
      tags: ['Profile'],
    },
  });
