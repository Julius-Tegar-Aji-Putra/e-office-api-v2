/**
 * Admin Management Route
 * Elysia routes untuk manajemen user oleh Super Admin
 * Prefix: /admin/users
 */

import { Elysia } from 'elysia';
import { authGuardPlugin } from '../../middlewares/auth';
import { adminManagementService } from './admin-management.service';
import {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema,
  userQuerySchema,
} from './admin-management.validation';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';
import { getUserRoles } from '../../lib/casbin';

export const adminManagementRoutes = new Elysia({ prefix: '/admin' })
  .use(authGuardPlugin)

  // Guard: only SUPERADMIN can access
  .onBeforeHandle(async ({ user }) => {
    const roles = await getUserRoles(user.id);
    if (!roles.includes('SUPERADMIN')) {
      throw new AppError('Akses ditolak. Hanya Super Admin yang dapat mengakses fitur ini.', HTTP_STATUS.FORBIDDEN);
    }
  })

  // ========== LIST USERS ==========
  .get('/users', async ({ query }) => {
    try {
      const result = await adminManagementService.listUsers(
        {
          search: query.search,
          role: query.role,
        },
        {
          page: query.page || 1,
          limit: query.limit || 10,
        }
      );
      return {
        success: true,
        message: 'Berhasil mengambil daftar pengguna',
        data: result.data,
        meta: result.meta,
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal mengambil daftar pengguna',
        HTTP_STATUS.INTERNAL_ERROR
      );
    }
  }, {
    query: userQuerySchema,
    detail: {
      summary: 'List all users (Admin)',
      description: 'Mendapatkan daftar semua user dengan pagination, search, dan filter role',
      tags: ['Admin Management'],
    },
  })

  // ========== GET USER DETAIL ==========
  .get('/users/:id', async ({ params }) => {
    try {
      const user = await adminManagementService.getUserById(params.id);
      if (!user) {
        throw new AppError('User tidak ditemukan', HTTP_STATUS.NOT_FOUND);
      }
      return {
        success: true,
        message: 'Berhasil mengambil detail pengguna',
        data: user,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal mengambil detail pengguna',
        HTTP_STATUS.INTERNAL_ERROR
      );
    }
  }, {
    params: userIdParamSchema,
    detail: {
      summary: 'Get user detail (Admin)',
      description: 'Mendapatkan detail user termasuk profil dan role',
      tags: ['Admin Management'],
    },
  })

  // ========== CREATE USER ==========
  .post('/users', async ({ body }) => {
    try {
      const result = await adminManagementService.createUser(body);
      return {
        success: true,
        message: 'User berhasil dibuat',
        data: result,
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal membuat user',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }, {
    body: createUserSchema,
    detail: {
      summary: 'Create new user (Admin)',
      description: 'Membuat user baru dengan profil dan role (Mahasiswa/Pegawai)',
      tags: ['Admin Management'],
    },
  })

  // ========== UPDATE USER ==========
  .patch('/users/:id', async ({ params, body }) => {
    try {
      const result = await adminManagementService.updateUser(params.id, body);
      return {
        success: true,
        message: result.message,
        data: { id: result.id },
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal memperbarui user',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }, {
    params: userIdParamSchema,
    body: updateUserSchema,
    detail: {
      summary: 'Update user (Admin)',
      description: 'Memperbarui data user, profil, dan/atau role',
      tags: ['Admin Management'],
    },
  })

  // ========== DELETE USER (Soft) ==========
  .delete('/users/:id', async ({ params }) => {
    try {
      const result = await adminManagementService.deleteUser(params.id);
      return {
        success: true,
        message: result.message,
        data: { id: result.id },
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal menghapus user',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }, {
    params: userIdParamSchema,
    detail: {
      summary: 'Delete user (Admin)',
      description: 'Soft delete user (non-destructive)',
      tags: ['Admin Management'],
    },
  })

  // ========== RESET PASSWORD ==========
  .post('/users/:id/reset-password', async ({ params }) => {
    try {
      const result = await adminManagementService.resetPassword(params.id);
      return {
        success: true,
        message: result.message,
        data: { id: result.id, defaultPassword: result.defaultPassword },
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal mereset password',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }, {
    params: userIdParamSchema,
    detail: {
      summary: 'Reset user password (Admin)',
      description: 'Reset password user ke default',
      tags: ['Admin Management'],
    },
  })

  // ========== GET ROLES LIST ==========
  .get('/roles', async () => {
    try {
      const roles = await adminManagementService.getRoles();
      return {
        success: true,
        message: 'Berhasil mengambil daftar role',
        data: roles,
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal mengambil daftar role',
        HTTP_STATUS.INTERNAL_ERROR
      );
    }
  }, {
    detail: {
      summary: 'Get all roles (Admin)',
      description: 'Mendapatkan daftar semua role yang tersedia',
      tags: ['Admin Management'],
    },
  });
