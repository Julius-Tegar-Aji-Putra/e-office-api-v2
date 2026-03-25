/**
 * Profile Service
 * Business logic untuk edit profil user (self-service)
 */

import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { profileRepository } from './profile.repository';
import { MinioService } from '../../shared/services/minio.service';
import { getUserRoles } from '../../lib/casbin';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http-status';
import { SELF_EDIT_DEPT_PRODI_ROLES } from './profile.types';
import type { UpdateProfileDTO, ChangePasswordDTO } from './profile.types';

// ============================================================================
// Constants
// ============================================================================

const AVATAR_FOLDER = 'avatars';

// ============================================================================
// Service
// ============================================================================

class ProfileService {
  private minio: MinioService;

  constructor() {
    this.minio = new MinioService();
  }

  /**
   * Get current user's full profile
   */
  async getMyProfile(userId: string) {
    const user = await profileRepository.findUserById(userId);
    if (!user) {
      throw new AppError('User tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const roles = await getUserRoles(userId);
    const primaryRole = roles[0] || null;

    // Build profile data
    let profile: any = null;
    let departemen: any = null;
    let programStudi: any = null;

    if (user.mahasiswa) {
      profile = {
        type: 'mahasiswa',
        nim: user.mahasiswa.nim,
        tahunMasuk: user.mahasiswa.tahunMasuk,
        noHp: user.mahasiswa.noHp,
        departemenId: user.mahasiswa.departemenId,
        departemenName: (user.mahasiswa as any).departemen?.name || '',
        programStudiId: user.mahasiswa.programStudiId,
        programStudiName: (user.mahasiswa as any).programStudi?.name || '',
      };
      departemen = (user.mahasiswa as any).departemen || null;
      programStudi = (user.mahasiswa as any).programStudi || null;
    } else if (user.pegawai) {
      profile = {
        type: 'pegawai',
        nip: user.pegawai.nip,
        jabatan: user.pegawai.jabatan,
        noHp: user.pegawai.noHp,
        departemenId: user.pegawai.departemenId,
        departemenName: (user.pegawai as any).departemen?.name || '',
        programStudiId: user.pegawai.programStudiId,
        programStudiName: (user.pegawai as any).programStudi?.name || '',
      };
      departemen = (user.pegawai as any).departemen || null;
      programStudi = (user.pegawai as any).programStudi || null;
    }

    // Generate presigned URL for avatar if it's a storage path
    let imageUrl = user.image;
    if (user.image && !user.image.startsWith('http')) {
      try {
        imageUrl = await this.minio.getFileUrl(user.image);
      } catch (err) {
        console.error('Failed to get avatar URL:', err);
      }
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: imageUrl,
      role: primaryRole,
      roles,
      profile,
      departemen,
      programStudi,
    };
  }

  /**
   * Update current user's profile
   */
  async updateProfile(userId: string, dto: UpdateProfileDTO) {
    const user = await profileRepository.findUserById(userId);
    if (!user) {
      throw new AppError('User tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const roles = await getUserRoles(userId);
    const primaryRole = roles[0] || '';
    const isMahasiswa = primaryRole === 'MAHASISWA';
    const isSuperAdmin = primaryRole === 'SUPERADMIN';
    const canEditDeptProdi = (SELF_EDIT_DEPT_PRODI_ROLES as readonly string[]).includes(primaryRole);

    // Force lowercase email
    if (dto.email) {
      dto.email = dto.email.toLowerCase().trim();
    }

    // ======== VALIDATIONS ========

    // Email uniqueness check
    if (dto.email && dto.email !== user.email) {
      const emailExists = await profileRepository.emailExists(dto.email, userId);
      if (emailExists) {
        throw new AppError('Email sudah terdaftar dalam sistem', HTTP_STATUS.BAD_REQUEST);
      }
    }

    // NIM validation (mahasiswa only)
    if (isMahasiswa && dto.nim) {
      if (!/^\d{14}$/.test(dto.nim)) {
        throw new AppError('NIM harus 14 digit angka', HTTP_STATUS.BAD_REQUEST);
      }
      if (dto.nim !== user.mahasiswa?.nim) {
        const nimExists = await profileRepository.nimExists(dto.nim, userId);
        if (nimExists) {
          throw new AppError('NIM sudah terdaftar', HTTP_STATUS.BAD_REQUEST);
        }
      }
    }

    // NIP validation (pegawai only, optional)
    if (!isMahasiswa && !isSuperAdmin && dto.nip) {
      if (dto.nip.length > 0 && !/^\d{18}$/.test(dto.nip)) {
        throw new AppError('NIP harus 18 digit angka', HTTP_STATUS.BAD_REQUEST);
      }
      if (dto.nip !== user.pegawai?.nip) {
        const nipExists = await profileRepository.nipExists(dto.nip, userId);
        if (nipExists) {
          throw new AppError('NIP sudah terdaftar', HTTP_STATUS.BAD_REQUEST);
        }
      }
    }

    // ======== UPDATE ========

    // 1. Update User basic info
    const userUpdateData: { name?: string; email?: string } = {};
    if (dto.name) userUpdateData.name = dto.name;
    if (dto.email) userUpdateData.email = dto.email;

    if (Object.keys(userUpdateData).length > 0) {
      await profileRepository.updateUser(userId, userUpdateData);
    }

    // Update account email if changed
    if (dto.email && dto.email !== user.email) {
      await profileRepository.updateAccountEmail(userId, dto.email);
    }

    // 2. Update profile based on role
    if (isMahasiswa && user.mahasiswa) {
      await profileRepository.updateMahasiswa(userId, {
        nim: dto.nim,
        tahunMasuk: dto.tahunMasuk,
        noHp: dto.noHp,
        ...(canEditDeptProdi && dto.departemenId ? { departemenId: dto.departemenId } : {}),
        ...(canEditDeptProdi && dto.programStudiId ? { programStudiId: dto.programStudiId } : {}),
      });
    } else if (!isMahasiswa && !isSuperAdmin && user.pegawai) {
      await profileRepository.updatePegawai(userId, {
        nip: dto.nip,
        jabatan: dto.jabatan,
        noHp: dto.noHp,
        ...(canEditDeptProdi && dto.departemenId ? { departemenId: dto.departemenId } : {}),
        ...(canEditDeptProdi && dto.programStudiId ? { programStudiId: dto.programStudiId } : {}),
      });
    }

    return { message: 'Profil berhasil diperbarui' };
  }

  /**
   * Change password (validate old password first)
   */
  async changePassword(userId: string, dto: ChangePasswordDTO) {
    // Validate confirm password matches
    if (dto.newPassword !== dto.confirmPassword) {
      throw new AppError('Konfirmasi password tidak sesuai', HTTP_STATUS.BAD_REQUEST);
    }

    const user = await profileRepository.findUserById(userId);
    if (!user) {
      throw new AppError('User tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Get current password hash
    const account = user.accounts[0];
    if (!account || !account.password) {
      throw new AppError('Akun credential tidak ditemukan', HTTP_STATUS.BAD_REQUEST);
    }

    // Verify old password using better-auth's verifyPassword
    const isOldPasswordValid = await verifyPassword({
      hash: account.password,
      password: dto.oldPassword,
    });
    if (!isOldPasswordValid) {
      throw new AppError('Password lama tidak sesuai', HTTP_STATUS.BAD_REQUEST);
    }

    // Hash and save new password
    const hashedNewPassword = await hashPassword(dto.newPassword);
    await profileRepository.updatePassword(userId, hashedNewPassword);

    return { message: 'Password berhasil diubah' };
  }

  /**
   * Upload avatar (profile picture)
   */
  async uploadAvatar(userId: string, file: File) {
    const user = await profileRepository.findUserById(userId);
    if (!user) {
      throw new AppError('User tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Delete old avatar from MinIO if exists
    if (user.image && !user.image.startsWith('http')) {
      try {
        await this.minio.deleteFile(user.image);
      } catch (err) {
        console.error('Failed to delete old avatar:', err);
      }
    }

    // Upload new avatar
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await this.minio.uploadFile(
      fileBuffer,
      file.name,
      file.type,
      AVATAR_FOLDER
    );

    // Save storage path to user record
    await profileRepository.updateAvatar(userId, uploadResult.path);

    // Return presigned URL for immediate use
    const imageUrl = await this.minio.getFileUrl(uploadResult.path);

    return {
      message: 'Foto profil berhasil diperbarui',
      image: imageUrl,
    };
  }

  /**
   * Delete avatar (revert to default)
   */
  async deleteAvatar(userId: string) {
    const user = await profileRepository.findUserById(userId);
    if (!user) {
      throw new AppError('User tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Delete from MinIO if exists
    if (user.image && !user.image.startsWith('http')) {
      try {
        await this.minio.deleteFile(user.image);
      } catch (err) {
        console.error('Failed to delete avatar from MinIO:', err);
      }
    }

    // Clear image field
    await profileRepository.updateAvatar(userId, null);

    return { message: 'Foto profil berhasil dihapus' };
  }
}

export const profileService = new ProfileService();
