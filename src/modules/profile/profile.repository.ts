/**
 * Profile Repository
 * Data access layer untuk profile management
 */

import { prisma } from '../../db';

export const profileRepository = {
  /**
   * Get user by ID with full profile relations
   */
  async findUserById(id: string) {
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
          select: { id: true, password: true },
        },
      },
    });
  },

  /**
   * Check if email already exists (exclude current user)
   */
  async emailExists(email: string, excludeUserId: string) {
    const user = await prisma.user.findFirst({
      where: {
        email,
        NOT: { id: excludeUserId },
      },
    });
    return !!user;
  },

  /**
   * Check if NIM already exists (exclude current user)
   */
  async nimExists(nim: string, excludeUserId: string) {
    const mhs = await prisma.mahasiswa.findFirst({
      where: {
        nim,
        NOT: { userId: excludeUserId },
      },
    });
    return !!mhs;
  },

  /**
   * Check if NIP already exists (exclude current user)
   */
  async nipExists(nip: string, excludeUserId: string) {
    const peg = await prisma.pegawai.findFirst({
      where: {
        nip,
        NOT: { userId: excludeUserId },
      },
    });
    return !!peg;
  },

  /**
   * Update user basic info (name, email, image)
   */
  async updateUser(id: string, data: { name?: string; email?: string; image?: string | null }) {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  /**
   * Update account email (accountId)
   */
  async updateAccountEmail(userId: string, newEmail: string) {
    return prisma.account.updateMany({
      where: { userId, providerId: 'credential' },
      data: { accountId: newEmail },
    });
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
   * Update mahasiswa profile
   */
  async updateMahasiswa(userId: string, data: {
    nim?: string;
    tahunMasuk?: string;
    noHp?: string;
    departemenId?: string;
    programStudiId?: string;
  }) {
    // Filter out undefined values
    const updateData: any = {};
    if (data.nim !== undefined) updateData.nim = data.nim;
    if (data.tahunMasuk !== undefined) updateData.tahunMasuk = data.tahunMasuk;
    if (data.noHp !== undefined) updateData.noHp = data.noHp;
    if (data.departemenId !== undefined) updateData.departemenId = data.departemenId;
    if (data.programStudiId !== undefined) updateData.programStudiId = data.programStudiId;

    if (Object.keys(updateData).length === 0) return;

    return prisma.mahasiswa.updateMany({
      where: { userId },
      data: updateData,
    });
  },

  /**
   * Update pegawai profile
   */
  async updatePegawai(userId: string, data: {
    nip?: string;
    jabatan?: string;
    noHp?: string;
    departemenId?: string;
    programStudiId?: string;
  }) {
    const updateData: any = {};
    if (data.nip !== undefined) updateData.nip = data.nip;
    if (data.jabatan !== undefined) updateData.jabatan = data.jabatan;
    if (data.noHp !== undefined) updateData.noHp = data.noHp;
    if (data.departemenId !== undefined) updateData.departemenId = data.departemenId;
    if (data.programStudiId !== undefined) updateData.programStudiId = data.programStudiId;

    if (Object.keys(updateData).length === 0) return;

    return prisma.pegawai.updateMany({
      where: { userId },
      data: updateData,
    });
  },

  /**
   * Update user image (avatar)
   */
  async updateAvatar(userId: string, imagePath: string | null) {
    return prisma.user.update({
      where: { id: userId },
      data: { image: imagePath },
    });
  },
};
