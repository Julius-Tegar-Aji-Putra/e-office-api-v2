/**
 * Dashboard Stats Route (Super Admin)
 */

import { Elysia } from 'elysia';
import { authGuardPlugin } from '../../middlewares/auth';
import { getUserRoles } from '../../lib/casbin';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';
import { prisma } from '../../db';

export const dashboardStatsRoutes = new Elysia({ prefix: '/admin/dashboard' })
  .use(authGuardPlugin)

  // Guard: only SUPERADMIN can access
  .onBeforeHandle(async ({ user }) => {
    const roles = await getUserRoles(user.id);
    if (!roles.includes('SUPERADMIN')) {
      throw new AppError('Akses ditolak. Hanya Super Admin yang dapat mengakses fitur ini.', HTTP_STATUS.FORBIDDEN);
    }
  })

  // ========== GET DASHBOARD STATS ==========
  .get('/stats', async () => {
    try {
      // User statistics
      const totalUsers = await prisma.user.count({
        where: { deletedAt: null },
      });

      const usersByRole = await prisma.userRole.groupBy({
        by: ['roleId'],
        where: {
          user: { deletedAt: null },
        },
        _count: { roleId: true },
      });

      const roles = await prisma.role.findMany({
        where: {
          id: { in: usersByRole.map((ur) => ur.roleId) },
        },
        select: { id: true, name: true },
      });

      const roleStats = usersByRole.map((stat) => {
        const role = roles.find((r) => r.id === stat.roleId);
        return {
          role: role?.name || 'Unknown',
          count: stat._count.roleId,
        };
      });

      // Department statistics
      const totalDepartments = await prisma.departemen.count({
        where: { 
          deletedAt: null,
          code: { not: 'FSM' }, // Exclude FSM placeholder
        },
      });

      const totalProdi = await prisma.programStudi.count({
        where: { 
          deletedAt: null,
          code: { not: 'FAKULTAS' }, // Exclude FAKULTAS placeholder
        },
      });

      const totalMahasiswa = await prisma.mahasiswa.count({
        where: { deletedAt: null },
      });

      const totalPegawai = await prisma.pegawai.count({
        where: { deletedAt: null },
      });

      return {
        success: true,
        message: 'Berhasil mengambil statistik dashboard',
        data: {
          users: {
            total: totalUsers,
            byRole: roleStats,
          },
          departments: {
            totalDepartments,
            totalProdi,
            totalMahasiswa,
            totalPegawai,
          },
        },
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal mengambil statistik dashboard',
        HTTP_STATUS.INTERNAL_ERROR
      );
    }
  }, {
    detail: {
      summary: 'Get dashboard statistics (Super Admin)',
      description: 'Statistik untuk dashboard Super Admin (user counts, dept counts, dll)',
      tags: ['Admin Dashboard'],
    },
  });
