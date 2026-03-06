/**
 * Admin Management Service
 * Business logic untuk manajemen user oleh Super Admin
 */

import { randomUUID } from 'crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '../../db';
import { adminManagementRepository } from './admin-management.repository';
import { assignRoleToUser, removeRoleFromUser } from '../../lib/casbin';
import {
  MAHASISWA_ROLE,
  SUPERADMIN_ROLE,
  DEPARTEMEN_LEVEL_ROLES,
  FAKULTAS_LEVEL_ROLES,
  SINGLE_HOLDER_ROLES,
  type CreateUserDTO,
  type UpdateUserDTO,
  type AdminUserListItem,
  type AdminUserDetail,
  type AdminUserFilter,
  type AdminUserPagination,
  type MahasiswaProfile,
  type PegawaiProfile,
} from './admin-management.types';

const DEFAULT_PASSWORD = 'password1234';

export const adminManagementService = {
  /**
   * List users with pagination + search + filter
   */
  async listUsers(filter: AdminUserFilter, pagination: AdminUserPagination) {
    const { items, total } = await adminManagementRepository.findMany(filter, pagination);

    const data: AdminUserListItem[] = items.map((user: any) => {
      const primaryRole = user.userRoles[0]?.role?.name || 'N/A';
      let unitKerja: string | null = null;
      let identifier: string | null = null;
      let jabatan: string | null = null;

      if (user.mahasiswa) {
        unitKerja = user.mahasiswa.programStudi?.name || user.mahasiswa.departemen?.name || null;
        identifier = user.mahasiswa.nim;
        jabatan = 'Mahasiswa';
      } else if (user.pegawai) {
        unitKerja = user.pegawai.departemen?.name || null;
        identifier = user.pegawai.nip;
        jabatan = user.pegawai.jabatan;
      }

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        role: primaryRole,
        unitKerja,
        identifier,
        jabatan,
        isActive: !user.deletedAt,
      };
    });

    return {
      data,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  },

  /**
   * Get user detail by ID
   */
  async getUserById(id: string): Promise<AdminUserDetail | null> {
    const user = await adminManagementRepository.findById(id);
    if (!user) return null;

    const primaryRole = user.userRoles[0]?.role?.name || 'N/A';
    const roleId = user.userRoles[0]?.role?.id || '';

    let profile: MahasiswaProfile | PegawaiProfile | null = null;

    if (user.mahasiswa) {
      profile = {
        type: 'mahasiswa',
        id: user.mahasiswa.id,
        nim: user.mahasiswa.nim,
        tahunMasuk: user.mahasiswa.tahunMasuk,
        noHp: user.mahasiswa.noHp,
        alamat: user.mahasiswa.alamat,
        tempatLahir: user.mahasiswa.tempatLahir,
        tanggalLahir: user.mahasiswa.tanggalLahir,
        departemenId: user.mahasiswa.departemenId,
        departemenName: (user.mahasiswa as any).departemen?.name || '',
        programStudiId: user.mahasiswa.programStudiId,
        programStudiName: (user.mahasiswa as any).programStudi?.name || '',
      };
    } else if (user.pegawai) {
      profile = {
        type: 'pegawai',
        id: user.pegawai.id,
        nip: user.pegawai.nip,
        jabatan: user.pegawai.jabatan,
        noHp: user.pegawai.noHp,
        departemenId: user.pegawai.departemenId,
        departemenName: (user.pegawai as any).departemen?.name || '',
        programStudiId: user.pegawai.programStudiId,
        programStudiName: (user.pegawai as any).programStudi?.name || '',
      };
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt,
      role: primaryRole,
      roleId,
      profile,
    };
  },

  /**
   * Create user with transaction (User + Account + Profile + UserRole)
   */
  async createUser(dto: CreateUserDTO) {
    // Force lowercase email
    dto.email = dto.email.toLowerCase().trim();

    // === VALIDATION ===

    // 1. Check email uniqueness
    const emailExists = await adminManagementRepository.emailExists(dto.email);
    if (emailExists) {
      throw new Error('Email sudah terdaftar dalam sistem');
    }

    // 2. Check role exists
    const role = await adminManagementRepository.getRoleByName(dto.role);
    if (!role) {
      throw new Error(`Role "${dto.role}" tidak ditemukan`);
    }

    // 3. Determine profile type and validate fields
    const isMahasiswa = dto.role === MAHASISWA_ROLE;
    const isSuperAdmin = dto.role === SUPERADMIN_ROLE;
    const isFakultasLevel = (FAKULTAS_LEVEL_ROLES as readonly string[]).includes(dto.role);
    const isDepartemenLevel = (DEPARTEMEN_LEVEL_ROLES as readonly string[]).includes(dto.role);

    // Get FSM dept/prodi for fakultas-level roles
    let departemenId = dto.departemenId;
    let programStudiId = dto.programStudiId;

    if (isFakultasLevel) {
      const fsmDept = await adminManagementRepository.getFSMDepartment();
      const fakProdi = await adminManagementRepository.getFakultasProdi();
      if (!fsmDept || !fakProdi) {
        throw new Error('Data Fakultas (FSM/FAKULTAS) belum ada di database');
      }
      departemenId = fsmDept.id;
      programStudiId = fakProdi.id;
    }

    // Validate Mahasiswa fields
    if (isMahasiswa) {
      if (!dto.nim) throw new Error('NIM wajib diisi untuk role Mahasiswa');
      if (!/^\d{14}$/.test(dto.nim)) throw new Error('NIM harus 14 digit angka');
      if (!departemenId) throw new Error('Departemen wajib dipilih');
      if (!programStudiId) throw new Error('Program Studi wajib dipilih');

      const nimExists = await adminManagementRepository.nimExists(dto.nim);
      if (nimExists) throw new Error('NIM sudah terdaftar');
    }

    // Validate Pegawai fields (non-superadmin, non-mahasiswa)
    if (!isMahasiswa && !isSuperAdmin) {
      if (!dto.nip) throw new Error('NIP wajib diisi');
      if (!/^\d{18}$/.test(dto.nip)) throw new Error('NIP harus 18 digit angka');
      if (!departemenId) throw new Error('Departemen wajib dipilih');
      if (!programStudiId) throw new Error('Program Studi wajib dipilih');

      const nipExists = await adminManagementRepository.nipExists(dto.nip);
      if (nipExists) throw new Error('NIP sudah terdaftar');
    }

    // 4. Single-holder validation
    if ((SINGLE_HOLDER_ROLES as readonly string[]).includes(dto.role)) {
      const existing = await adminManagementRepository.isRoleOccupied(dto.role);
      if (existing) {
        throw new Error(
          `Role ${dto.role} sudah diisi oleh ${existing.user.name}. Hanya boleh 1 user aktif untuk role ini.`
        );
      }
    }

    // 5. KADEP single per department
    if (dto.role === 'KADEP' && departemenId) {
      const existing = await adminManagementRepository.isKadepOccupied(departemenId);
      if (existing) {
        throw new Error(
          `Departemen ini sudah memiliki Ketua Departemen: ${existing.user.name}`
        );
      }
    }

    // 6. KAPRODI validation
    if (dto.role === 'KAPRODI') {
      if (!programStudiId) throw new Error('Program Studi wajib dipilih untuk Kaprodi');

      const prodi = await adminManagementRepository.getProdiById(programStudiId);
      if (!prodi) throw new Error('Program Studi tidak ditemukan');
      if (!prodi.hasKaprodi) {
        throw new Error(
          `Program Studi "${prodi.name}" tidak memiliki slot Kaprodi (hasKaprodi = false). Prodi ini dikelola oleh Ketua Departemen.`
        );
      }

      const existing = await adminManagementRepository.isKaprodiOccupied(programStudiId);
      if (existing) {
        throw new Error(
          `Prodi "${prodi.name}" sudah memiliki Kaprodi: ${existing.user.name}`
        );
      }
    }

    // === CREATE (Transaction) ===
    const password = dto.password || DEFAULT_PASSWORD;
    const hashedPwd = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      // 1. Create User + Account + UserRole
      const newUser = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          emailVerified: true,
          accounts: {
            create: {
              id: randomUUID(),
              providerId: 'credential',
              accountId: dto.email,
              password: hashedPwd,
            },
          },
          userRoles: {
            create: {
              roleId: role.id,
            },
          },
        },
      });

      // 2. Create Profile
      if (isMahasiswa) {
        await tx.mahasiswa.create({
          data: {
            userId: newUser.id,
            nim: dto.nim!,
            tahunMasuk: dto.tahunMasuk || new Date().getFullYear().toString(),
            noHp: dto.noHp || '',
            departemenId: departemenId!,
            programStudiId: programStudiId!,
          },
        });
      } else if (!isSuperAdmin) {
        await tx.pegawai.create({
          data: {
            userId: newUser.id,
            nip: dto.nip!,
            jabatan: dto.jabatan || dto.role,
            noHp: dto.noHp || null,
            departemenId: departemenId!,
            programStudiId: programStudiId!,
          },
        });
      }

      return newUser;
    });

    // 3. Sync Casbin policy
    await assignRoleToUser(user.id, dto.role);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: dto.role,
      defaultPassword: password,
    };
  },

  /**
   * Update user
   */
  async updateUser(id: string, dto: UpdateUserDTO) {
    // Force lowercase email if provided
    if (dto.email) {
      dto.email = dto.email.toLowerCase().trim();
    }

    const existingUser = await adminManagementRepository.findById(id);
    if (!existingUser) {
      throw new Error('User tidak ditemukan');
    }

    const currentRole = existingUser.userRoles[0]?.role?.name;

    // Check email uniqueness if changed
    if (dto.email && dto.email !== existingUser.email) {
      const emailExists = await adminManagementRepository.emailExists(dto.email, id);
      if (emailExists) throw new Error('Email sudah terdaftar');
    }

    // Determine new role
    const newRole = dto.role || currentRole;
    const isMahasiswa = newRole === MAHASISWA_ROLE;
    const isSuperAdmin = newRole === SUPERADMIN_ROLE;
    const isFakultasLevel = (FAKULTAS_LEVEL_ROLES as readonly string[]).includes(newRole);

    let departemenId = dto.departemenId;
    let programStudiId = dto.programStudiId;

    if (isFakultasLevel) {
      const fsmDept = await adminManagementRepository.getFSMDepartment();
      const fakProdi = await adminManagementRepository.getFakultasProdi();
      if (!fsmDept || !fakProdi) throw new Error('Data Fakultas belum ada di database');
      departemenId = fsmDept.id;
      programStudiId = fakProdi.id;
    }

    // Validate NIM/NIP uniqueness if changed
    if (isMahasiswa && dto.nim && dto.nim !== existingUser.mahasiswa?.nim) {
      if (!/^\d{14}$/.test(dto.nim)) throw new Error('NIM harus 14 digit angka');
      const nimExists = await adminManagementRepository.nimExists(dto.nim, id);
      if (nimExists) throw new Error('NIM sudah terdaftar');
    }

    if (!isMahasiswa && !isSuperAdmin && dto.nip && dto.nip !== existingUser.pegawai?.nip) {
      if (!/^\d{18}$/.test(dto.nip)) throw new Error('NIP harus 18 digit angka');
      const nipExists = await adminManagementRepository.nipExists(dto.nip, id);
      if (nipExists) throw new Error('NIP sudah terdaftar');
    }

    // Single-holder validation for new role
    if (dto.role && dto.role !== currentRole) {
      if ((SINGLE_HOLDER_ROLES as readonly string[]).includes(dto.role)) {
        const existing = await adminManagementRepository.isRoleOccupied(dto.role, id);
        if (existing) {
          throw new Error(`Role ${dto.role} sudah diisi oleh ${existing.user.name}`);
        }
      }
      if (dto.role === 'KADEP' && departemenId) {
        const existing = await adminManagementRepository.isKadepOccupied(departemenId, id);
        if (existing) {
          throw new Error(`Departemen ini sudah memiliki Kadep: ${existing.user.name}`);
        }
      }
      if (dto.role === 'KAPRODI' && programStudiId) {
        const prodi = await adminManagementRepository.getProdiById(programStudiId);
        if (prodi && !prodi.hasKaprodi) {
          throw new Error(`Prodi "${prodi.name}" tidak memiliki slot Kaprodi`);
        }
        const existing = await adminManagementRepository.isKaprodiOccupied(programStudiId, id);
        if (existing) {
          throw new Error(`Prodi ini sudah memiliki Kaprodi: ${existing.user.name}`);
        }
      }
    }

    // === UPDATE (Transaction) ===
    await prisma.$transaction(async (tx) => {
      // 1. Update User basic info
      const userUpdateData: any = {};
      if (dto.name) userUpdateData.name = dto.name;
      if (dto.email) {
        userUpdateData.email = dto.email;
        // Also update account's accountId
        await tx.account.updateMany({
          where: { userId: id, providerId: 'credential' },
          data: { accountId: dto.email },
        });
      }
      if (Object.keys(userUpdateData).length > 0) {
        await tx.user.update({ where: { id }, data: userUpdateData });
      }

      // 2. Handle role change
      if (dto.role && dto.role !== currentRole) {
        const newRoleRecord = await adminManagementRepository.getRoleByName(dto.role);
        if (!newRoleRecord) throw new Error(`Role "${dto.role}" tidak ditemukan`);

        // Remove old roles
        await tx.userRole.deleteMany({ where: { userId: id } });
        // Add new role
        await tx.userRole.create({
          data: { userId: id, roleId: newRoleRecord.id },
        });

        // Update Casbin (only for active users)
        if (existingUser.deletedAt === null) {
          if (currentRole) await removeRoleFromUser(id, currentRole);
          await assignRoleToUser(id, dto.role);
        }
      }

      // 3. Update or create profile based on role
      const roleChanged = dto.role && dto.role !== currentRole;
      const previousIsMahasiswa = currentRole === MAHASISWA_ROLE;

      if (roleChanged) {
        // Role changed — potentially need to switch profile type
        if (previousIsMahasiswa && !isMahasiswa) {
          // Was Mahasiswa, now Pegawai — delete mahasiswa, create pegawai
          await tx.mahasiswa.deleteMany({ where: { userId: id } });
          if (!isSuperAdmin) {
            await tx.pegawai.create({
              data: {
                userId: id,
                nip: dto.nip || '',
                jabatan: dto.jabatan || dto.role || '',
                noHp: dto.noHp || null,
                departemenId: departemenId || '',
                programStudiId: programStudiId || '',
              },
            });
          }
        } else if (!previousIsMahasiswa && isMahasiswa) {
          // Was Pegawai, now Mahasiswa — delete pegawai, create mahasiswa
          await tx.pegawai.deleteMany({ where: { userId: id } });
          await tx.mahasiswa.create({
            data: {
              userId: id,
              nim: dto.nim || '',
              tahunMasuk: dto.tahunMasuk || new Date().getFullYear().toString(),
              noHp: dto.noHp || '',
              departemenId: departemenId || '',
              programStudiId: programStudiId || '',
            },
          });
        } else if (isMahasiswa) {
          // Still Mahasiswa — update profile
          await tx.mahasiswa.updateMany({
            where: { userId: id },
            data: {
              ...(dto.nim && { nim: dto.nim }),
              ...(dto.tahunMasuk && { tahunMasuk: dto.tahunMasuk }),
              ...(dto.noHp !== undefined && { noHp: dto.noHp }),
              ...(departemenId && { departemenId }),
              ...(programStudiId && { programStudiId }),
            },
          });
        } else if (!isSuperAdmin) {
          // Still Pegawai — update profile
          const pegawaiUpdate: any = {};
          if (dto.nip) pegawaiUpdate.nip = dto.nip;
          if (dto.jabatan) pegawaiUpdate.jabatan = dto.jabatan;
          if (dto.noHp !== undefined) pegawaiUpdate.noHp = dto.noHp;
          if (departemenId) pegawaiUpdate.departemenId = departemenId;
          if (programStudiId) pegawaiUpdate.programStudiId = programStudiId;
          if (Object.keys(pegawaiUpdate).length > 0) {
            await tx.pegawai.updateMany({
              where: { userId: id },
              data: pegawaiUpdate,
            });
          }
        }
      } else {
        // Same role — just update profile fields
        if (isMahasiswa && existingUser.mahasiswa) {
          const mhsUpdate: any = {};
          if (dto.nim) mhsUpdate.nim = dto.nim;
          if (dto.tahunMasuk) mhsUpdate.tahunMasuk = dto.tahunMasuk;
          if (dto.noHp !== undefined) mhsUpdate.noHp = dto.noHp;
          if (departemenId) mhsUpdate.departemenId = departemenId;
          if (programStudiId) mhsUpdate.programStudiId = programStudiId;
          if (Object.keys(mhsUpdate).length > 0) {
            await tx.mahasiswa.updateMany({
              where: { userId: id },
              data: mhsUpdate,
            });
          }
        } else if (!isMahasiswa && !isSuperAdmin && existingUser.pegawai) {
          const pegUpdate: any = {};
          if (dto.nip) pegUpdate.nip = dto.nip;
          if (dto.jabatan) pegUpdate.jabatan = dto.jabatan;
          if (dto.noHp !== undefined) pegUpdate.noHp = dto.noHp;
          if (departemenId) pegUpdate.departemenId = departemenId;
          if (programStudiId) pegUpdate.programStudiId = programStudiId;
          if (Object.keys(pegUpdate).length > 0) {
            await tx.pegawai.updateMany({
              where: { userId: id },
              data: pegUpdate,
            });
          }
        }
      }
    });

    return { id, message: 'User berhasil diperbarui' };
  },

  /**
   * Reset password to default
   */
  async resetPassword(id: string) {
    const user = await adminManagementRepository.findById(id);
    if (!user) throw new Error('User tidak ditemukan');

    const hashedPwd = await hashPassword(DEFAULT_PASSWORD);
    await adminManagementRepository.updatePassword(id, hashedPwd);

    return {
      id,
      message: 'Password berhasil direset',
      defaultPassword: DEFAULT_PASSWORD,
    };
  },

  /**
   * Soft delete user
   */
  async deleteUser(id: string) {
    const user = await adminManagementRepository.findById(id);
    if (!user) throw new Error('User tidak ditemukan');

    // Remove from Casbin
    const role = user.userRoles[0]?.role?.name;
    if (role) {
      await removeRoleFromUser(id, role);
    }

    await adminManagementRepository.softDeleteUser(id);
    return { id, message: 'User berhasil dihapus' };
  },

  /**
   * Reactivate a soft-deleted user
   */
  async reactivateUser(id: string) {
    const user = await adminManagementRepository.findById(id);
    if (!user) throw new Error('User tidak ditemukan');
    if (!user.deletedAt) throw new Error('User sudah aktif');

    const role = user.userRoles[0]?.role?.name;
    if (!role) throw new Error('User tidak memiliki role');

    // Single-holder validation
    if ((SINGLE_HOLDER_ROLES as readonly string[]).includes(role)) {
      const existing = await adminManagementRepository.isRoleOccupied(role, id);
      if (existing) {
        throw new Error(
          `Tidak dapat mengaktifkan akun. Role ${role} sudah diisi oleh ${existing.user.name}. Hanya boleh 1 user aktif untuk role ini.`
        );
      }
    }

    // KADEP single per department
    if (role === 'KADEP') {
      const departemenId = user.pegawai?.departemenId;
      if (departemenId) {
        const existing = await adminManagementRepository.isKadepOccupied(departemenId, id);
        if (existing) {
          throw new Error(
            `Tidak dapat mengaktifkan akun. Departemen ini sudah memiliki Ketua Departemen: ${existing.user.name}`
          );
        }
      }
    }

    // KAPRODI validation
    if (role === 'KAPRODI') {
      const programStudiId = user.pegawai?.programStudiId;
      if (programStudiId) {
        const existing = await adminManagementRepository.isKaprodiOccupied(programStudiId, id);
        if (existing) {
          throw new Error(
            `Tidak dapat mengaktifkan akun. Prodi ini sudah memiliki Kaprodi: ${existing.user.name}`
          );
        }
      }
    }

    // Reactivate user
    await adminManagementRepository.reactivateUser(id);

    // Re-add Casbin role
    await assignRoleToUser(id, role);

    return { id, message: 'User berhasil diaktifkan kembali' };
  },

  /**
   * Get all available roles (for dropdown)
   */
  async getRoles() {
    const roles = await adminManagementRepository.getAllRoles();
    return roles
      .filter((r: any) => r.name !== SUPERADMIN_ROLE)
      .map((r: any) => ({ id: r.id, name: r.name }));
  },
};
