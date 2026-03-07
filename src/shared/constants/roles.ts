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
 * Role formatted display names for logs
 */
export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  [ROLES.DEKAN]: 'Dekan',
  [ROLES.WADEK_1]: 'Wakil Dekan I',
  [ROLES.WADEK_2]: 'Wakil Dekan II',
  [ROLES.MANAJER_TU]: 'Manajer Tata Usaha',
  [ROLES.SUPERVISOR_AKADEMIK]: 'Supervisor Akademik',
  [ROLES.SUPERVISOR_SUMBER_DAYA]: 'Supervisor Sumber Daya',
  [ROLES.STAF_AKADEMIK]: 'Staf Akademik',
  [ROLES.STAF_SUMBER_DAYA]: 'Staf Sumber Daya',
  [ROLES.KAPRODI]: 'Ketua Program Studi',
  [ROLES.KADEP]: 'Ketua Departemen',
  [ROLES.ADMIN_PRODI]: 'Admin Prodi',
  [ROLES.ADMIN_FAKULTAS]: 'Admin Fakultas',
  [ROLES.UPA]: 'Unit Pelaksana Akademik',
  [ROLES.MAHASISWA]: 'Mahasiswa',
  [ROLES.DOSEN]: 'Dosen',
  [ROLES.SUPERADMIN]: 'Superadmin',
};

export function formatRoleForLog(role: string): string {
  if (!role) return '';
  if (ROLE_DISPLAY_NAMES[role]) return ROLE_DISPLAY_NAMES[role];
  const upperRole = role.toUpperCase();
  if (ROLE_DISPLAY_NAMES[upperRole]) return ROLE_DISPLAY_NAMES[upperRole];

  // Custom fallback to replace underscores if it's not mapped
  return role.replace(/_/g, ' ');
}

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
 * Verifikasi Flow by Letter Category (UMUM)
 * Urutan: Staf -> Supervisor (dipilih saat submit) -> Manajer TU -> Wadek II -> Wadek I -> Dekan
 * NOTE: Staf bisa akademik atau sumber daya, supervisor dipilih saat submit
 */
export const VERIFICATION_FLOW_UMUM = [
  // Staf ditentukan saat runtime (STAF_AKADEMIK atau STAF_SUMBER_DAYA)
  // Supervisor ditentukan saat submit (SUPERVISOR_AKADEMIK atau SUPERVISOR_SUMBER_DAYA)
  ROLES.MANAJER_TU,
  ROLES.WADEK_2,
  ROLES.WADEK_1,
  ROLES.DEKAN
] as const;

/**
 * Full verification flow for UMUM with all possible roles
 * Used for return targets and button logic
 */
export const VERIFICATION_FLOW_UMUM_FULL = [
  ROLES.STAF_AKADEMIK,
  ROLES.STAF_SUMBER_DAYA,
  ROLES.SUPERVISOR_AKADEMIK,
  ROLES.SUPERVISOR_SUMBER_DAYA,
  ROLES.MANAJER_TU,
  ROLES.WADEK_2,
  ROLES.WADEK_1,
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
 * PENTING: Flow HARUS selalu urut sesuai hierarki, tidak boleh skip
 */
export function getVerificationFlow(category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM'): readonly string[] {
  switch (category) {
    case 'AKADEMIK':
      return VERIFICATION_FLOW_AKADEMIK;
    case 'SUMBER_DAYA':
      return VERIFICATION_FLOW_SUMBER_DAYA;
    case 'UMUM':
      // UMUM: MTU -> Wadek 2 -> Wadek 1 -> Dekan
      // Staf dan Supervisor ditentukan saat runtime
      return VERIFICATION_FLOW_UMUM;
    default:
      return VERIFICATION_FLOW_AKADEMIK;
  }
}

/**
 * Get full verification flow including staf/supervisor for return targets
 */
export function getFullVerificationFlow(category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM'): readonly string[] {
  switch (category) {
    case 'AKADEMIK':
      return VERIFICATION_FLOW_AKADEMIK;
    case 'SUMBER_DAYA':
      return VERIFICATION_FLOW_SUMBER_DAYA;
    case 'UMUM':
      return VERIFICATION_FLOW_UMUM_FULL;
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
 * PENTING: Flow SELALU berurutan, tidak boleh skip role apapun
 * Target tanda tangan HANYA menentukan jenis tombol, BUKAN routing
 */
export function getNextVerifier(currentRole: string, category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM'): string | null {
  // Untuk kategori UMUM, kita perlu handling khusus karena staf/supervisor dinamis
  if (category === 'UMUM') {
    // Mapping next role untuk UMUM
    const umurNextMap: Record<string, string> = {
      [ROLES.STAF_AKADEMIK]: '', // Ditentukan saat submit (supervisor dipilih)
      [ROLES.STAF_SUMBER_DAYA]: '', // Ditentukan saat submit (supervisor dipilih)
      [ROLES.SUPERVISOR_AKADEMIK]: ROLES.MANAJER_TU,
      [ROLES.SUPERVISOR_SUMBER_DAYA]: ROLES.MANAJER_TU,
      [ROLES.MANAJER_TU]: ROLES.WADEK_2,
      [ROLES.WADEK_2]: ROLES.WADEK_1,
      [ROLES.WADEK_1]: ROLES.DEKAN,
      [ROLES.DEKAN]: '', // End of flow
    };
    return umurNextMap[currentRole] || null;
  }

  const flow = getVerificationFlow(category);
  const currentIndex = flow.indexOf(currentRole as any);

  if (currentIndex === -1 || currentIndex === flow.length - 1) {
    return null;
  }

  return flow[currentIndex + 1];
}

/**
 * Get return targets for "Kembalikan" action
 * ATURAN DOKUMEN:
 * - Kembalikan BOLEH loncat role (tidak wajib mengikuti hierarki)
 * - Dropdown berisi: Staff, Supervisor, Manajer TU, Wadek 2, Wadek 1, Dekan
 * - Opsi disesuaikan dengan jalur surat dan role di bawah current
 */
export function getReturnTargets(currentRole: string, category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM'): string[] {
  // Semua role yang bisa jadi target kembalikan (sesuai dokumen)
  const allTargets: Record<string, string[]> = {
    AKADEMIK: [
      ROLES.STAF_AKADEMIK,
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.MANAJER_TU,
      ROLES.WADEK_1,
      ROLES.DEKAN
    ],
    SUMBER_DAYA: [
      ROLES.STAF_SUMBER_DAYA,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.MANAJER_TU,
      ROLES.WADEK_2,
      ROLES.DEKAN
    ],
    UMUM: [
      ROLES.STAF_AKADEMIK,
      ROLES.STAF_SUMBER_DAYA,
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.MANAJER_TU,
      ROLES.WADEK_2,
      ROLES.WADEK_1,
      ROLES.DEKAN
    ]
  };

  const targets = allTargets[category] || allTargets.UMUM;

  // Hierarki untuk filter (hanya bisa kembalikan ke role di bawah)
  const hierarchy: Record<string, number> = {
    [ROLES.STAF_AKADEMIK]: 1,
    [ROLES.STAF_SUMBER_DAYA]: 1,
    [ROLES.SUPERVISOR_AKADEMIK]: 2,
    [ROLES.SUPERVISOR_SUMBER_DAYA]: 2,
    [ROLES.MANAJER_TU]: 3,
    [ROLES.WADEK_2]: 4,
    [ROLES.WADEK_1]: 5,
    [ROLES.DEKAN]: 6,
  };

  const currentLevel = hierarchy[currentRole] || 0;

  // Filter: hanya role di bawah current role
  return targets.filter(role => {
    const roleLevel = hierarchy[role] || 0;
    return roleLevel < currentLevel;
  });
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

/**
 * Hierarchy level untuk menentukan signature mana yang perlu di-clear
 * saat surat dikembalikan (return).
 *
 * ATURAN:
 * Saat surat dikembalikan ke targetRole, semua tanda tangan dari role
 * yang level hierarkinya >= targetRole harus dihapus (perlu diulangi).
 *
 * Contoh UMUM:
 * - Dekan return ke Wadek 1 → clear Wadek 1 (level 5) saja
 * - Dekan return ke Wadek 2 → clear Wadek 2 (level 4) + Wadek 1 (level 5)
 * - Wadek 1 return ke Wadek 2 → clear Wadek 2 (level 4)
 */
const SIGNATURE_HIERARCHY: Record<string, number> = {
  [ROLES.STAF_AKADEMIK]: 1,
  [ROLES.STAF_SUMBER_DAYA]: 1,
  [ROLES.SUPERVISOR_AKADEMIK]: 2,
  [ROLES.SUPERVISOR_SUMBER_DAYA]: 2,
  [ROLES.MANAJER_TU]: 3,
  [ROLES.WADEK_2]: 4,
  [ROLES.WADEK_1]: 5,
  [ROLES.DEKAN]: 6,
};

/**
 * Get list of signer roles whose signatures should be cleared
 * when a letter is returned to targetRole.
 *
 * Logic: return all roles in the verification flow for the given category
 * whose hierarchy level >= targetRole's level.
 * Only roles that can actually sign (SIGNATORY_ROLES) are returned.
 */
export function getRolesToClearSignatures(
  targetRole: string,
  category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM'
): string[] {
  const flow = getFullVerificationFlow(category);
  const targetLevel = SIGNATURE_HIERARCHY[targetRole] || 0;

  // Return signatory roles in the flow that are at or above the target level
  return [...flow].filter(role => {
    const roleLevel = SIGNATURE_HIERARCHY[role] || 0;
    return roleLevel >= targetLevel && (SIGNATORY_ROLES as readonly string[]).includes(role);
  });
}
