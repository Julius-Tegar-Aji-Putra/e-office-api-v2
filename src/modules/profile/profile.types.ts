/**
 * Profile Module Types
 * Types untuk fitur edit profil dan avatar user
 */

// ============================================================================
// DTO Types
// ============================================================================

export interface UpdateProfileDTO {
  name?: string;
  email?: string;
  noHp?: string;
  // Mahasiswa fields
  nim?: string;
  tahunMasuk?: string;
  // Pegawai fields
  nip?: string;
  jabatan?: string;
  // Dept/Prodi (only processed for MAHASISWA & DOSEN)
  departemenId?: string;
  programStudiId?: string;
}

export interface ChangePasswordDTO {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

// ============================================================================
// Response Types
// ============================================================================

export interface ProfileResponse {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  roles: string[];
  profile: MahasiswaProfileData | PegawaiProfileData | null;
  departemen: { id: string; name: string; code: string } | null;
  programStudi: { id: string; name: string; code: string } | null;
}

export interface MahasiswaProfileData {
  type: 'mahasiswa';
  nim: string;
  tahunMasuk: string;
  noHp: string;
  departemenId: string;
  departemenName: string;
  programStudiId: string;
  programStudiName: string;
}

export interface PegawaiProfileData {
  type: 'pegawai';
  nip: string;
  jabatan: string;
  noHp: string | null;
  departemenId: string;
  departemenName: string;
  programStudiId: string;
  programStudiName: string;
}

// ============================================================================
// Role constants (for dept/prodi edit restriction)
// ============================================================================

/** Roles that CAN edit their own departemen & programStudi */
export const SELF_EDIT_DEPT_PRODI_ROLES = ['MAHASISWA', 'DOSEN'] as const;

/** Roles that can manage signatures */
export const SIGNATURE_MANAGEMENT_ROLES = [
  'KAPRODI', 'KADEP', 'DEKAN', 'WADEK_1', 'WADEK_2',
] as const;
