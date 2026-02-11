/**
 * Admin Management Repository
 * Data access layer untuk manajemen user oleh Super Admin
 */

import { prisma } from '../../db';
import type { AdminUserFilter, AdminUserPagination } from './admin-management.types';

export const adminManagementRepository = {
  /**
   * List users with pagination, search, and role filter
   */
  async findMany(
    filter: AdminUserFilter,
    pagination: AdminUserPagination
  ) {
    const where: any = {
      deletedAt: null,
    };

    // Search by name or email
    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { email: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    // Filter by role
    if (filter.role) {
      where.userRoles = {
        some: {
          role: { name: filter.role },
        },
      };
    }

    const skip = (pagination.page - 1) * pagination.limit;

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
          mahasiswa: {
            include: {
              departemen: { select: { id: true, name: true, code: true } },
              programStudi: { select: { id: true, name: true, code: true } },
            },
          },
          pegawai: {
            include: {
              departemen: { select: { id: true, name: true, code: true } },
              programStudi: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pagination.limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { items, total };
  },

  /**
   * Get user by ID with full relations
   */
  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          include: { role: true },
        },
        mahasiswa: {
          include: {
            departemen: { select: { id: true, name: true, code: true } },
            programStudi: { select: { id: true, name: true, code: true } },
          },
        },
        pegawai: {
          include: {
            departemen: { select: { id: true, name: true, code: true } },
            programStudi: { select: { id: true, name: true, code: true } },
          },
        },
        accounts: {
          where: { providerId: 'credential' },
          select: { id: true },
        },
      },
    });
  },

  /**
   * Check if email already exists
   */
  async emailExists(email: string, excludeUserId?: string) {
    const where: any = { email };
    if (excludeUserId) {
      where.NOT = { id: excludeUserId };
    }
    const user = await prisma.user.findFirst({ where });
    return !!user;
  },

  /**
   * Check if NIM already exists
   */
  async nimExists(nim: string, excludeUserId?: string) {
    const where: any = { nim };
    if (excludeUserId) {
      where.NOT = { userId: excludeUserId };
    }
    const mhs = await prisma.mahasiswa.findFirst({ where });
    return !!mhs;
  },

  /**
   * Check if NIP already exists
   */
  async nipExists(nip: string, excludeUserId?: string) {
    const where: any = { nip };
    if (excludeUserId) {
      where.NOT = { userId: excludeUserId };
    }
    const peg = await prisma.pegawai.findFirst({ where });
    return !!peg;
  },

  /**
   * Check if a single-holder role is already occupied
   */
  async isRoleOccupied(roleName: string, excludeUserId?: string) {
    const where: any = {
      role: { name: roleName },
      user: { deletedAt: null },
    };
    if (excludeUserId) {
      where.NOT = { userId: excludeUserId };
    }
    const existing = await prisma.userRole.findFirst({
      where,
      include: { user: { select: { id: true, name: true } } },
    });
    return existing;
  },

  /**
   * Check if KADEP role is already occupied for a specific department
   */
  async isKadepOccupied(departemenId: string, excludeUserId?: string) {
    const where: any = {
      role: { name: 'KADEP' },
      user: {
        deletedAt: null,
        pegawai: { departemenId },
      },
    };
    if (excludeUserId) {
      where.NOT = { userId: excludeUserId };
    }
    const existing = await prisma.userRole.findFirst({
      where,
      include: { user: { select: { id: true, name: true } } },
    });
    return existing;
  },

  /**
   * Check if KAPRODI role is already occupied for a specific prodi
   */
  async isKaprodiOccupied(programStudiId: string, excludeUserId?: string) {
    const where: any = {
      role: { name: 'KAPRODI' },
      user: {
        deletedAt: null,
        pegawai: { programStudiId },
      },
    };
    if (excludeUserId) {
      where.NOT = { userId: excludeUserId };
    }
    const existing = await prisma.userRole.findFirst({
      where,
      include: { user: { select: { id: true, name: true } } },
    });
    return existing;
  },

  /**
   * Get role by name
   */
  async getRoleByName(name: string) {
    return prisma.role.findUnique({ where: { name } });
  },

  /**
   * Get all roles
   */
  async getAllRoles() {
    return prisma.role.findMany({ orderBy: { name: 'asc' } });
  },

  /**
   * Get program studi by ID
   */
  async getProdiById(id: string) {
    return prisma.programStudi.findUnique({
      where: { id },
      include: { departemen: true },
    });
  },

  /**
   * Get FSM department (Fakultas)
   */
  async getFSMDepartment() {
    return prisma.departemen.findFirst({ where: { code: 'FSM' } });
  },

  /**
   * Get FAKULTAS program studi
   */
  async getFakultasProdi() {
    return prisma.programStudi.findFirst({ where: { code: 'FAKULTAS' } });
  },

  /**
   * Update account password
   */
  async updatePassword(userId: string, hashedPassword: string) {
    return prisma.account.updateMany({
      where: { userId, providerId: 'credential' },
      data: { password: hashedPassword },
    });
  },

  /**
   * Soft delete user
   */
  async softDeleteUser(id: string) {
    const now = new Date();
    return prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { deletedAt: now },
      }),
      prisma.mahasiswa.updateMany({
        where: { userId: id },
        data: { deletedAt: now },
      }),
      prisma.pegawai.updateMany({
        where: { userId: id },
        data: { deletedAt: now },
      }),
    ]);
  },
};
