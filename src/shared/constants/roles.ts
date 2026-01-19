/**
 * Roles Constants
 * Definisi role sistem E-Office
 */

export const ROLES = {
  // Mahasiswa & Dosen
  PEMOHON: 'Pemohon',              // Mahasiswa yang mengajukan surat
  DOSEN: 'Dosen',                  // Dosen pembimbing / validator
  
  // Prodi
  KAPRODI: 'Kaprodi',              // Kepala Program Studi
  SEKPRODI: 'Sekprodi',            // Sekretaris Program Studi
  STAFF_PRODI: 'StaffProdi',       // Staff administrasi prodi
  
  // Departemen
  KADEP: 'Kadep',                  // Kepala Departemen
  SEKDEP: 'Sekdep',                // Sekretaris Departemen
  STAFF_DEPT: 'StaffDept',         // Staff administrasi departemen
  
  // Fakultas
  DEKAN: 'Dekan',                  // Dekan Fakultas
  WADEK: 'Wadek',                  // Wakil Dekan
  STAFF_FAKULTAS: 'StaffFakultas', // Staff administrasi fakultas
  
  // Unit Pelayanan Administrasi
  UPA: 'UPA',                      // Unit Pelayanan Administrasi (legalisasi)
  
  // System
  ADMIN: 'Admin',                  // Super Admin
} as const;

export type RoleType = typeof ROLES[keyof typeof ROLES];

// Role groups untuk kemudahan checking
export const ROLE_GROUPS = {
  PRODI_LEADERS: [ROLES.KAPRODI, ROLES.SEKPRODI],
  DEPT_LEADERS: [ROLES.KADEP, ROLES.SEKDEP],
  FAKULTAS_LEADERS: [ROLES.DEKAN, ROLES.WADEK],
  ALL_LEADERS: [ROLES.KAPRODI, ROLES.SEKPRODI, ROLES.KADEP, ROLES.SEKDEP, ROLES.DEKAN, ROLES.WADEK],
  STAFF: [ROLES.STAFF_PRODI, ROLES.STAFF_DEPT, ROLES.STAFF_FAKULTAS],
};
