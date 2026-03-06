/**
 * Admin Management Module Types
 * Types untuk modul manajemen user oleh Super Admin
 */

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  role: string;
  unitKerja: string | null;
  identifier: string | null; // NIM atau NIP
  jabatan: string | null;
  isActive: boolean;
}

export interface AdminUserDetail {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  role: string;
  roleId: string;
  profile: MahasiswaProfile | PegawaiProfile | null;
}

export interface MahasiswaProfile {
  type: 'mahasiswa';
  id: string;
  nim: string;
  tahunMasuk: string;
  noHp: string | null;
  alamat: string | null;
  tempatLahir: string | null;
  tanggalLahir: Date | null;
  departemenId: string;
  departemenName: string;
  programStudiId: string;
  programStudiName: string;
}

export interface PegawaiProfile {
  type: 'pegawai';
  id: string;
  nip: string;
  jabatan: string;
  noHp: string | null;
  departemenId: string;
  departemenName: string;
  programStudiId: string;
  programStudiName: string;
}

export interface CreateUserDTO {
  name: string;
  email: string;
  role: string;
  password?: string;
  // Mahasiswa fields
  nim?: string;
  tahunMasuk?: string;
  noHp?: string;
  // Pegawai fields
  nip?: string;
  jabatan?: string;
  // Common
  departemenId?: string;
  programStudiId?: string;
}

export interface UpdateUserDTO {
  name?: string;
  email?: string;
  role?: string;
  // Mahasiswa fields
  nim?: string;
  tahunMasuk?: string;
  noHp?: string;
  // Pegawai fields
  nip?: string;
  jabatan?: string;
  // Common
  departemenId?: string;
  programStudiId?: string;
}

export interface AdminUserFilter {
  search?: string;
  role?: string;
  status?: 'active' | 'inactive';
}

export interface AdminUserPagination {
  page: number;
  limit: number;
}

// Role categories for form logic
export const MAHASISWA_ROLE = 'MAHASISWA';
export const SUPERADMIN_ROLE = 'SUPERADMIN';

export const DEPARTEMEN_LEVEL_ROLES = [
  'MAHASISWA', 'DOSEN', 'KAPRODI', 'ADMIN_PRODI', 'KADEP',
] as const;

export const FAKULTAS_LEVEL_ROLES = [
  'ADMIN_FAKULTAS', 'DEKAN', 'WADEK_1', 'WADEK_2', 'MANAJER_TU',
  'SUPERVISOR_AKADEMIK', 'SUPERVISOR_SUMBER_DAYA',
  'STAF_AKADEMIK', 'STAF_SUMBER_DAYA', 'UPA',
] as const;

export const SINGLE_HOLDER_ROLES = [
  'DEKAN', 'WADEK_1', 'WADEK_2', 'MANAJER_TU',
  'SUPERVISOR_AKADEMIK', 'SUPERVISOR_SUMBER_DAYA',
] as const;

export const SINGLE_HOLDER_PER_UNIT_ROLES = [
  'KADEP', 'KAPRODI',
] as const;

export const ALL_ASSIGNABLE_ROLES = [
  'MAHASISWA', 'DOSEN', 'KAPRODI', 'ADMIN_PRODI', 'KADEP',
  'ADMIN_FAKULTAS', 'DEKAN', 'WADEK_1', 'WADEK_2', 'MANAJER_TU',
  'SUPERVISOR_AKADEMIK', 'SUPERVISOR_SUMBER_DAYA',
  'STAF_AKADEMIK', 'STAF_SUMBER_DAYA', 'UPA',
] as const;
