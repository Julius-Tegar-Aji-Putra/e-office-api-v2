/**
 * Role Constants - Sesuai Prompting.md
 * Definisi semua role dalam sistem E-Office ST/SK Dekan
 */

export const ROLES = {
  SUPERADMIN: 'SUPERADMIN',
  MAHASISWA: 'MAHASISWA',
  DOSEN: 'DOSEN',
  KAPRODI: 'KAPRODI',
  ADMIN_PRODI: 'ADMIN_PRODI',
  KADEP: 'KADEP',
  ADMIN_FAKULTAS: 'ADMIN_FAKULTAS',
  DEKAN: 'DEKAN',
  WADEK_1: 'WADEK_1',
  WADEK_2: 'WADEK_2',
  MANAJER_TU: 'MANAJER_TU',
  SUPERVISOR_AKADEMIK: 'SUPERVISOR_AKADEMIK',
  SUPERVISOR_SUMBER_DAYA: 'SUPERVISOR_SUMBER_DAYA',
  STAF_AKADEMIK: 'STAF_AKADEMIK',
  STAF_SUMBER_DAYA: 'STAF_SUMBER_DAYA',
  UPA: 'UPA',
  
  // Aliases for compatibility
  KETUA_PRODI: 'KAPRODI',
  KETUA_DEPARTEMEN: 'KADEP',
  WAKIL_DEKAN_1: 'WADEK_1',
  WAKIL_DEKAN_2: 'WADEK_2',
} as const;

export type RoleName = typeof ROLES[keyof typeof ROLES];

/**
 * Role Hierarchy Levels
 * Higher number = higher authority
 */
export const ROLE_HIERARCHY: Record<string, number> = {
  [ROLES.DEKAN]: 100,
  [ROLES.WADEK_1]: 90,
  [ROLES.WADEK_2]: 90,
  [ROLES.MANAJER_TU]: 80,
  [ROLES.SUPERVISOR_AKADEMIK]: 70,
  [ROLES.SUPERVISOR_SUMBER_DAYA]: 70,
  [ROLES.STAF_AKADEMIK]: 60,
  [ROLES.STAF_SUMBER_DAYA]: 60,
  [ROLES.UPA]: 65,
  [ROLES.ADMIN_FAKULTAS]: 75,
  [ROLES.KADEP]: 85,
  [ROLES.KAPRODI]: 80,
  [ROLES.ADMIN_PRODI]: 70,
  [ROLES.DOSEN]: 50,
  [ROLES.MAHASISWA]: 10,
  [ROLES.SUPERADMIN]: 999
};

/**
 * Lingkup Departemen Roles
 */
export const DEPARTEMEN_ROLES = [
  ROLES.MAHASISWA,
  ROLES.DOSEN,
  ROLES.KAPRODI,
  ROLES.ADMIN_PRODI,
  ROLES.KADEP
] as const;

/**
 * Lingkup Fakultas Roles
 */
export const FAKULTAS_ROLES = [
  ROLES.ADMIN_FAKULTAS,
  ROLES.DEKAN,
  ROLES.WADEK_1,
  ROLES.WADEK_2,
  ROLES.MANAJER_TU,
  ROLES.SUPERVISOR_AKADEMIK,
  ROLES.SUPERVISOR_SUMBER_DAYA,
  ROLES.STAF_AKADEMIK,
  ROLES.STAF_SUMBER_DAYA,
  ROLES.UPA
] as const;

/**
 * Pengaju (dapat membuat surat baru)
 */
export const PENGAJU_ROLES = [
  ROLES.MAHASISWA,
  ROLES.DOSEN
] as const;

/**
 * Pejabat Struktural (dapat disposisi/verifikasi/ttd)
 */
export const PEJABAT_ROLES = [
  ROLES.DEKAN,
  ROLES.WADEK_1,
  ROLES.WADEK_2,
  ROLES.MANAJER_TU,
  ROLES.SUPERVISOR_AKADEMIK,
  ROLES.SUPERVISOR_SUMBER_DAYA
] as const;

/**
 * Staf (dapat drafting surat keluar)
 */
export const STAF_ROLES = [
  ROLES.STAF_AKADEMIK,
  ROLES.STAF_SUMBER_DAYA
] as const;

/**
 * Supervisor (dapat verifikasi draft)
 */
export const SUPERVISOR_ROLES = [
  ROLES.SUPERVISOR_AKADEMIK,
  ROLES.SUPERVISOR_SUMBER_DAYA
] as const;

/**
 * Role yang dapat menandatangani
 */
export const SIGNATORY_ROLES = [
  ROLES.KAPRODI,
  ROLES.KADEP,
  ROLES.DEKAN,
  ROLES.WADEK_1,
  ROLES.WADEK_2
] as const;

/**
 * Disposisi Target by Letter Category (AKADEMIK)
 * Urutan: Dekan -> Wadek I -> Manajer TU -> Spv Akademik -> Staf Akademik
 */
export const DISPOSISI_TARGET_AKADEMIK = [
  ROLES.DEKAN,
  ROLES.WADEK_1,
  ROLES.MANAJER_TU,
  ROLES.SUPERVISOR_AKADEMIK,
  ROLES.STAF_AKADEMIK
] as const;

/**
 * Disposisi Target by Letter Category (SUMBER_DAYA)
 * Urutan: Dekan -> Wadek II -> Manajer TU -> Spv SD -> Staf SD
 */
export const DISPOSISI_TARGET_SUMBER_DAYA = [
  ROLES.DEKAN,
  ROLES.WADEK_2,
  ROLES.MANAJER_TU,
  ROLES.SUPERVISOR_SUMBER_DAYA,
  ROLES.STAF_SUMBER_DAYA
] as const;

/**
 * Disposisi Target by Letter Category (UMUM)
 * Semua pejabat tersedia
 */
export const DISPOSISI_TARGET_UMUM = [
  ROLES.DEKAN,
  ROLES.WADEK_1,
  ROLES.WADEK_2,
  ROLES.MANAJER_TU,
  ROLES.SUPERVISOR_AKADEMIK,
  ROLES.SUPERVISOR_SUMBER_DAYA,
  ROLES.STAF_AKADEMIK,
  ROLES.STAF_SUMBER_DAYA
] as const;

/**
 * Verifikasi Flow by Letter Category (AKADEMIK)
 * Urutan: Staf -> Spv Akademik -> Manajer TU -> Wadek I -> Dekan
 */
export const VERIFICATION_FLOW_AKADEMIK = [
  ROLES.STAF_AKADEMIK,
  ROLES.SUPERVISOR_AKADEMIK,
  ROLES.MANAJER_TU,
  ROLES.WADEK_1,
  ROLES.DEKAN
] as const;

/**
 * Verifikasi Flow by Letter Category (SUMBER_DAYA)
 * Urutan: Staf -> Spv SD -> Manajer TU -> Wadek II -> Dekan
 */
export const VERIFICATION_FLOW_SUMBER_DAYA = [
  ROLES.STAF_SUMBER_DAYA,
  ROLES.SUPERVISOR_SUMBER_DAYA,
  ROLES.MANAJER_TU,
  ROLES.WADEK_2,
  ROLES.DEKAN
] as const;

/**
 * Get disposisi targets based on letter category
 */
export function getDisposisiTargets(category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM'): readonly string[] {
  switch (category) {
    case 'AKADEMIK':
      return DISPOSISI_TARGET_AKADEMIK;
    case 'SUMBER_DAYA':
      return DISPOSISI_TARGET_SUMBER_DAYA;
    case 'UMUM':
      return DISPOSISI_TARGET_UMUM;
    default:
      return DISPOSISI_TARGET_UMUM;
  }
}

/**
 * Get verification flow based on letter category
 */
export function getVerificationFlow(category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM'): readonly string[] {
  switch (category) {
    case 'AKADEMIK':
      return VERIFICATION_FLOW_AKADEMIK;
    case 'SUMBER_DAYA':
      return VERIFICATION_FLOW_SUMBER_DAYA;
    case 'UMUM':
      // For UMUM, defaults to AKADEMIK flow but with options at Manajer TU level
      return VERIFICATION_FLOW_AKADEMIK;
    default:
      return VERIFICATION_FLOW_AKADEMIK;
  }
}

/**
 * Check if role can disposition to target role
 */
export function canDispositionTo(fromRole: string, toRole: string): boolean {
  const fromLevel = ROLE_HIERARCHY[fromRole] ?? 0;
  const toLevel = ROLE_HIERARCHY[toRole] ?? 0;
  return fromLevel > toLevel;
}

/**
 * Get next role in verification chain
 */
export function getNextVerifier(currentRole: string, category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM'): string | null {
  const flow = getVerificationFlow(category);
  const currentIndex = flow.indexOf(currentRole as any);
  
  if (currentIndex === -1 || currentIndex === flow.length - 1) {
    return null;
  }
  
  return flow[currentIndex + 1];
}

/**
 * Get return targets (roles below current in hierarchy)
 */
export function getReturnTargets(currentRole: string, category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM'): string[] {
  const flow = getVerificationFlow(category);
  const currentIndex = flow.indexOf(currentRole as any);
  
  if (currentIndex <= 0) {
    return [];
  }
  
  return flow.slice(0, currentIndex) as unknown as string[];
}

/**
 * ============================================================================
 * DISPOSITION TARGETS BY ROLE AND CATEGORY
 * ============================================================================
 * Disposisi harus mempertimbangkan:
 * 1. Jabatan (role hierarchy) - hanya bisa ke role lebih rendah
 * 2. Jenis surat (kategori) - AKADEMIK, SUMBER_DAYA, UMUM
 *
 * Contoh:
 * - Wadek 1 + surat UMUM → MTU, Semua SPV, Semua Staff
 * - Wadek 1 + surat AKADEMIK → MTU, SPV Akademik, Staff Akademik
 * - Wadek 2 + surat SUMBER_DAYA → MTU, SPV Sumber Daya, Staff Sumber Daya
 */

type RoleDispositionTargets = Record<'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM', readonly string[]>;

export const ROLE_DISPOSITION_TARGETS: Record<string, RoleDispositionTargets> = {
  [ROLES.DEKAN]: {
    UMUM: [
      ROLES.WADEK_1,
      ROLES.WADEK_2,
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.STAF_AKADEMIK,
      ROLES.STAF_SUMBER_DAYA
    ],
    AKADEMIK: [
      ROLES.WADEK_1,
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.STAF_AKADEMIK
    ],
    SUMBER_DAYA: [
      ROLES.WADEK_2,
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.STAF_SUMBER_DAYA
    ]
  },
  [ROLES.WADEK_1]: {
    UMUM: [
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.STAF_AKADEMIK,
      ROLES.STAF_SUMBER_DAYA
    ],
    AKADEMIK: [
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.STAF_AKADEMIK
    ],
    SUMBER_DAYA: [
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.STAF_SUMBER_DAYA
    ]
  },
  [ROLES.WADEK_2]: {
    UMUM: [
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.STAF_AKADEMIK,
      ROLES.STAF_SUMBER_DAYA
    ],
    AKADEMIK: [
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.STAF_AKADEMIK
    ],
    SUMBER_DAYA: [
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.STAF_SUMBER_DAYA
    ]
  },
  [ROLES.MANAJER_TU]: {
    UMUM: [
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.STAF_AKADEMIK,
      ROLES.STAF_SUMBER_DAYA
    ],
    AKADEMIK: [
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.STAF_AKADEMIK
    ],
    SUMBER_DAYA: [
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.STAF_SUMBER_DAYA
    ]
  },
  [ROLES.SUPERVISOR_AKADEMIK]: {
    UMUM: [ROLES.STAF_AKADEMIK, ROLES.STAF_SUMBER_DAYA], // Untuk kategori UMUM, bisa pilih semua staf
    AKADEMIK: [ROLES.STAF_AKADEMIK],
    SUMBER_DAYA: [] // Tidak bisa disposisi ke SD dari SPV Akademik
  },
  [ROLES.SUPERVISOR_SUMBER_DAYA]: {
    UMUM: [ROLES.STAF_AKADEMIK, ROLES.STAF_SUMBER_DAYA], // Untuk kategori UMUM, bisa pilih semua staf
    AKADEMIK: [], // Tidak bisa disposisi ke Akademik dari SPV SD
    SUMBER_DAYA: [ROLES.STAF_SUMBER_DAYA]
  }
} as const;

/**
 * Get disposition targets based on role AND category
 */
export function getDispositionTargetsForRole(
  role: string,
  category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM'
): string[] {
  const roleTargets = ROLE_DISPOSITION_TARGETS[role];
  if (!roleTargets) return [];
  return [...(roleTargets[category] || [])];
}
