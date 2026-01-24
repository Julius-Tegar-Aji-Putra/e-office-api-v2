/**
 * Disposisi Module Types
 * Types untuk modul disposisi (Lingkup Fakultas - Surat Masuk)
 * Sesuai Prompting.md Modul C: DISPOSISI
 */

import type { LetterStatus, LetterCategory, Priority } from '../../generated/prisma/enums';

// ============================================================================
// Enums & Constants
// ============================================================================

/**
 * Kategori jenis surat untuk routing disposisi
 * Sesuai Prompting.md point 9
 */
export type SuratCategory = 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM';

/**
 * Target roles berdasarkan kategori surat
 * Sesuai Prompting.md:
 * - UMUM: Semua Pejabat (Dekan, Wadek 1/2, Manajer TU)
 * - AKADEMIK: Dekan, Wadek 1, Manajer TU, Spv Akademik
 * - SUMBER_DAYA: Dekan, Wadek 2, Manajer TU, Spv SD
 */
export const DISPOSISI_TARGETS = {
  UMUM: ['DEKAN', 'WADEK_1', 'WADEK_2', 'MANAJER_TU'],
  AKADEMIK: ['DEKAN', 'WADEK_1', 'MANAJER_TU', 'SPV_AKADEMIK', 'STAF_AKADEMIK'],
  SUMBER_DAYA: ['DEKAN', 'WADEK_2', 'MANAJER_TU', 'SPV_SUMBER_DAYA', 'STAF_SUMBER_DAYA'],
} as const;

/**
 * Hirarki pejabat untuk disposisi
 * Sesuai Prompting.md point 10: Dekan -> Wadek -> Manajer TU -> Supervisor -> Staf
 */
export const PEJABAT_HIERARCHY = [
  'DEKAN',
  'WADEK_1',
  'WADEK_2',
  'MANAJER_TU',
  'SPV_AKADEMIK',
  'SPV_SUMBER_DAYA',
  'STAF_AKADEMIK',
  'STAF_SUMBER_DAYA',
] as const;

// ============================================================================
// Input Types
// ============================================================================

/**
 * DTO untuk Admin Fakultas assign kategori dan teruskan
 */
export interface AssignCategoryDTO {
  letterInstanceId: string;
  category: SuratCategory;
  targetRole: string; // Role tujuan pertama
  notes?: string;
}

/**
 * DTO untuk Pejabat melakukan disposisi ke bawah
 */
export interface CreateDisposisiDTO {
  letterInstanceId: string;
  targetRole: string; // Role bawahan
  notes?: string;
  priority?: Priority;
}

/**
 * DTO untuk menyelesaikan surat di level pejabat
 */
export interface SelesaiDisposisiDTO {
  letterInstanceId: string;
  catatan: string; // Wajib - alasan mengapa surat cukup diproses sampai di sini
}

/**
 * DTO untuk mengembalikan surat
 */
export interface KembalikanDisposisiDTO {
  letterInstanceId: string;
  targetRole: string; // Role tujuan pengembalian (default: ADMIN_PRODI)
  alasan: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Item di dashboard Admin Fakultas (Surat Masuk)
 */
export interface AdminFakultasSuratMasukItem {
  id: string;
  namaPengaju: string;
  judulSurat: string;
  tipeSurat: string; // ST/SK
  jenisSurat: SuratCategory | null; // Akademik/Sumber Daya/Umum
  tanggalMasuk: Date;
  status: LetterStatus;
  displayStatus: string;
  needsAction: boolean;
  actionType: 'ASSIGN_CATEGORY' | 'NONE';
}

/**
 * Item di dashboard Pejabat (Surat Masuk)
 */
export interface PejabatSuratMasukItem {
  id: string;
  namaPengaju: string;
  judulSurat: string;
  tipeSurat: string;
  jenisSurat: SuratCategory;
  tanggalMasuk: Date;
  status: LetterStatus;
  displayStatus: string;
  needsAction: boolean;
  actionType: 'DISPOSISI' | 'SELESAI' | 'KEMBALIKAN' | 'NONE';
  disposedBy?: string; // Siapa yang mendisposisi ke saya
}

/**
 * Options untuk dropdown disposisi
 * Filtered berdasarkan hirarki dan kategori surat
 */
export interface DisposisiTargetOption {
  role: string;
  name: string; // Display name
  jabatan: string;
  level: number; // Hierarchy level
  available: boolean; // Apakah bisa dipilih
}

/**
 * Detail disposisi untuk view
 */
export interface DisposisiDetail {
  letterInstance: {
    id: string;
    status: LetterStatus;
    currentActiveRole: string | null;
    category: LetterCategory | null;
    submissionValues: unknown;
    createdBy: {
      id: string;
      name: string;
    };
  };
  pengantarDocument: {
    id: string;
    perihal: string | null;
    isSigned: boolean;
    fileUrl: string | null;
  } | null;
  disposisiHistory: DisposisiLogItem[];
  permissions: DisposisiPermissions;
  targetOptions: DisposisiTargetOption[];
}

/**
 * Log item untuk riwayat disposisi
 */
export interface DisposisiLogItem {
  id: string;
  action: string;
  fromRole: string;
  toRole: string | null;
  actorName: string;
  notes: string | null;
  createdAt: Date;
}

/**
 * Permissions untuk disposisi view
 */
export interface DisposisiPermissions {
  canAssignCategory: boolean; // Admin Fakultas
  canDisposisi: boolean; // Pejabat
  canSelesai: boolean; // Pejabat
  canKembalikan: boolean; // Pejabat
  showDisposisiDropdown: boolean;
  showSelesaiButton: boolean;
  showKembalikanButton: boolean;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Filter untuk dashboard queries
 */
export interface DisposisiFilter {
  category?: SuratCategory;
  needsAction?: boolean;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * User dengan role info untuk disposisi
 */
export interface DisposisiActor {
  userId: string;
  role: string;
  jabatan: string;
  hierarchyLevel: number;
}

/**
 * Mendapatkan hierarchy level dari role
 */
export function getHierarchyLevel(role: string): number {
  const index = PEJABAT_HIERARCHY.indexOf(role as any);
  return index === -1 ? 999 : index;
}

/**
 * Check apakah role A bisa disposisi ke role B
 * A harus lebih tinggi dari B (level lebih kecil)
 */
export function canDisposiseTo(fromRole: string, toRole: string): boolean {
  return getHierarchyLevel(fromRole) < getHierarchyLevel(toRole);
}

/**
 * Get available targets for disposisi based on current role and category
 */
export function getDisposisiTargets(currentRole: string, category: SuratCategory): string[] {
  const currentLevel = getHierarchyLevel(currentRole);
  const categoryTargets = DISPOSISI_TARGETS[category];

  return categoryTargets.filter((role) => {
    const targetLevel = getHierarchyLevel(role);
    return targetLevel > currentLevel; // Hanya yang level-nya lebih rendah
  });
}
