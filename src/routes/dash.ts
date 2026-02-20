/**
 * Dashboard Routes
 * Unified dashboard endpoints per role
 * Base path: /dash
 * 
 * Sesuai README Spesifikasi Dashboard:
 * - Lingkup Departemen: Mahasiswa/Dosen, Kaprodi, Admin Prodi, Kadep
 * - Lingkup Fakultas: Admin Fakultas, Pejabat, Supervisor, Staf, UPA
 */

import { Elysia, t } from 'elysia';
import { authGuardPlugin } from '../middlewares/auth';
import { db } from '../db';
import { LetterStatus, LogAction, DocumentType } from '../generated/prisma/enums';
import { ROLES } from '../shared/constants/roles';
import { getUserRoles } from '../lib/casbin';

// ============================================================================
// TYPES
// ============================================================================

interface DashboardUser {
  id: string;
  name: string;
  email: string;
  role: string;
  departemenId?: string;
  programStudiId?: string;
}

interface DashboardFilters {
  status?: string;
  displayStatus?: string; // Filter berdasarkan displayStatus yang ditampilkan ke user
  type?: 'masuk' | 'keluar';
  documentType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: string;
  limit?: string;
}

interface DashboardColumn {
  key: string;
  label: string;
  sortable?: boolean;
}

interface DashboardItem {
  id: string;
  judulSurat: string;
  namaPengaju?: string;
  tipeSurat: string; // Surat Tugas / Surat Keputusan
  jenisSurat?: string; // Akademik / Sumber Daya / Umum
  nomorSurat?: string;
  tanggalSurat: Date;
  status: string;
  displayStatus: string;
  actions: string[];
}

interface DashboardResult {
  columns: DashboardColumn[];
  items: DashboardItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  statistics: {
    total: number;
    pending: number;
    completed: number;
    waiting: number;
  };
  tabs?: { key: string; label: string; count: number }[];
  filters?: { status: string[] };
}

// ============================================================================
// KAMUS DEFINISI STATUS SURAT UNTUK TIAP AKTOR
// ============================================================================

type DisplayStatusType =
  | 'DIPROSES'
  | 'SELESAI'
  | 'DITOLAK'
  | 'DIKEMBALIKAN KE PENGAJU'
  | 'DIKEMBALIKAN'
  | 'MENUNGGU ANDA'
  | 'MENUNGGU DIVERIFIKASI'
  | 'MENUNGGU DITANDATANGANI'
  | 'SURAT DIBUAT';

// ============================================================================
// PRIORITY SORTING FOR DASHBOARD
// ============================================================================

/**
 * Mendapatkan prioritas untuk sorting berdasarkan displayStatus
 * Semakin kecil angkanya, semakin tinggi prioritasnya (muncul di atas)
 * 
 * Urutan prioritas:
 * 1. MENUNGGU ANDA / MENUNGGU DIVERIFIKASI / MENUNGGU DITANDATANGANI (prioritas tertinggi)
 * 2. DIPROSES
 * 3. SELESAI
 * 4. DIKEMBALIKAN / DIKEMBALIKAN KE PENGAJU
 * 5. DITOLAK (prioritas terendah)
 */
function getDisplayStatusPriority(displayStatus: string): number {
  const upperStatus = displayStatus.toUpperCase();

  // Menunggu (prioritas tertinggi)
  if (upperStatus.includes('MENUNGGU')) {
    return 1;
  }

  // Diproses
  if (upperStatus === 'DIPROSES') {
    return 2;
  }

  // Selesai
  if (upperStatus === 'SELESAI') {
    return 3;
  }

  // Dikembalikan
  if (upperStatus.includes('DIKEMBALIKAN')) {
    return 4;
  }

  // Ditolak
  if (upperStatus === 'DITOLAK') {
    return 5;
  }

  // Default (unknown status)
  return 99;
}

/**
 * Sort items berdasarkan prioritas displayStatus, kemudian tanggal (terbaru di atas dalam grup yang sama)
 */
function sortByDisplayStatusPriority<T extends { displayStatus: string; tanggalSurat: Date }>(items: T[]): T[] {
  return items.sort((a, b) => {
    const priorityA = getDisplayStatusPriority(a.displayStatus);
    const priorityB = getDisplayStatusPriority(b.displayStatus);

    // Urutkan berdasarkan prioritas dulu
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Jika prioritas sama, urutkan berdasarkan tanggal (terbaru di atas)
    return new Date(b.tanggalSurat).getTime() - new Date(a.tanggalSurat).getTime();
  });
}

// ============================================================================
// AVAILABLE STATUS OPTIONS FOR FILTERS
// ============================================================================

const AVAILABLE_DISPLAY_STATUSES = [
  'MENUNGGU ANDA',
  'MENUNGGU DIVERIFIKASI',
  'MENUNGGU DITANDATANGANI',
  'DIPROSES',
  'SELESAI',
  'DIKEMBALIKAN',
  'DIKEMBALIKAN KE PENGAJU',
  'DITOLAK',
];

function getDisplayStatusForRole(status: LetterStatus, role: string, currentActiveRole?: string | null): DisplayStatusType {
  // AKTOR 1: MAHASISWA/DOSEN
  if (role === ROLES.MAHASISWA || role === ROLES.DOSEN) {
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
    if (status === LetterStatus.REJECTED) return 'DITOLAK';
    if (status === LetterStatus.CANCELLED) return 'DIKEMBALIKAN KE PENGAJU';
    return 'DIPROSES';
  }

  // AKTOR 2: KETUA PRODI
  if (role === ROLES.KAPRODI) {
    if (status === LetterStatus.SUBMITTED || status === LetterStatus.KAPRODI_REVIEW) {
      return 'MENUNGGU DIVERIFIKASI';
    }
    if (status === LetterStatus.SURAT_PENGANTAR_REVIEW && currentActiveRole === ROLES.KAPRODI) {
      return 'MENUNGGU DITANDATANGANI';
    }
    if (status === LetterStatus.SURAT_DIBUAT) {
      return 'SURAT DIBUAT'; // PERBAIKAN: Status penutup Surat Masuk
    }
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
    if (status === LetterStatus.REJECTED) return 'DITOLAK';
    if (status === LetterStatus.CANCELLED) return 'DIKEMBALIKAN KE PENGAJU';
    return 'DIPROSES';
  }

  // AKTOR 3: ADMIN PRODI
  if (role === ROLES.ADMIN_PRODI) {
    if (status === LetterStatus.SURAT_PENGANTAR_DRAFT) {
      return 'MENUNGGU ANDA';
    }
    if (status === LetterStatus.SURAT_DIBUAT) {
      return 'SURAT DIBUAT'; // PERBAIKAN: Status penutup Surat Masuk
    }
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
    if (status === LetterStatus.CANCELLED) return 'DIKEMBALIKAN KE PENGAJU';
    return 'DIPROSES';
  }

  // AKTOR 4: KETUA DEPARTEMEN
  if (role === ROLES.KADEP) {
    // KADEP approval untuk prodi tanpa Kaprodi
    if (status === LetterStatus.SUBMITTED && currentActiveRole === ROLES.KADEP) {
      return 'MENUNGGU DIVERIFIKASI';
    }
    // KADEP signing surat pengantar
    if (status === LetterStatus.SURAT_PENGANTAR_REVIEW && currentActiveRole === ROLES.KADEP) {
      return 'MENUNGGU DITANDATANGANI';
    }
    if (status === LetterStatus.SURAT_DIBUAT) {
      return 'SURAT DIBUAT'; // PERBAIKAN: Status penutup Surat Masuk
    }
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
    if (status === LetterStatus.REJECTED) return 'DITOLAK';
    if (status === LetterStatus.CANCELLED) return 'DIKEMBALIKAN KE PENGAJU';
    return 'DIPROSES';
  }

  // AKTOR 5: ADMIN SURAT FAKULTAS
  if (role === ROLES.ADMIN_FAKULTAS) {
    if (status === LetterStatus.SURAT_PENGANTAR_SIGNED || status === LetterStatus.FAKULTAS_RECEIVED) {
      return 'MENUNGGU ANDA';
    }
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
    if (status === LetterStatus.CANCELLED) return 'DIKEMBALIKAN KE PENGAJU';
    return 'DIPROSES';
  }

  // AKTOR 6: PEJABAT (DEKAN, WADEK I, WADEK II, Manajer TU)
  if ([ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2, ROLES.MANAJER_TU].includes(role as any)) {
    if (
      (status === LetterStatus.FAKULTAS_DISPOSITION ||
        status === LetterStatus.FAKULTAS_VERIFICATION ||
        status === LetterStatus.FAKULTAS_SIGNING) &&
      currentActiveRole === role
    ) {
      return 'MENUNGGU ANDA';
    }
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
    if (status === LetterStatus.CANCELLED) return 'DIKEMBALIKAN';
    return 'DIPROSES';
  }

  // AKTOR 7: SUPERVISOR (SUPERVISOR_AKADEMIK, SUPERVISOR_SUMBER_DAYA)
  if ([ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA].includes(role as any)) {
    if (
      (status === LetterStatus.FAKULTAS_DISPOSITION ||
        status === LetterStatus.FAKULTAS_VERIFICATION ||
        status === LetterStatus.SURAT_DIBUAT ||
        status === LetterStatus.FAKULTAS_DRAFTING) &&
      currentActiveRole === role
    ) {
      return 'MENUNGGU ANDA';
    }
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
    if (status === LetterStatus.CANCELLED) return 'DIKEMBALIKAN';
    return 'DIPROSES';
  }

  // AKTOR 8: STAF AKADEMIK/SUMBER DAYA
  if ([ROLES.STAF_AKADEMIK, ROLES.STAF_SUMBER_DAYA].includes(role as any)) {
    if (
      (status === LetterStatus.SURAT_DIBUAT || status === LetterStatus.FAKULTAS_DRAFTING) &&
      currentActiveRole === role
    ) {
      return 'MENUNGGU ANDA';
    }
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
    return 'DIPROSES';
  }

  // AKTOR 9: UPA
  if (role === ROLES.UPA) {
    if (
      status === LetterStatus.UPA_NUMBERING ||
      status === LetterStatus.UPA_STAMPING ||
      status === LetterStatus.UPA_FINALIZING
    ) {
      return 'MENUNGGU ANDA';
    }
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
    return 'DIPROSES';
  }

  return 'DIPROSES';
}

// ============================================================================
// COLUMN DEFINITIONS PER ROLE (Sesuai README)
// ============================================================================

const COLUMNS = {
  // [Lingkup Departemen] Mahasiswa/Dosen
  MAHASISWA_DOSEN: [
    { key: 'judulSurat', label: 'Judul Surat', sortable: true },
    { key: 'tipeSurat', label: 'Tipe Surat', sortable: true },
    { key: 'tanggalSurat', label: 'Tanggal Surat', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Aksi' },
  ],

  // [Lingkup Departemen] Ketua Prodi, Admin Prodi, Ketua Departemen
  DEPARTEMEN_STAFF: [
    { key: 'namaPengaju', label: 'Nama Pengaju', sortable: true },
    { key: 'judulSurat', label: 'Judul Surat', sortable: true },
    { key: 'tipeSurat', label: 'Tipe Surat', sortable: true },
    { key: 'tanggalSurat', label: 'Tanggal Surat', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Aksi' },
  ],

  // [Lingkup Fakultas] Admin Surat Fakultas - Surat Masuk
  ADMIN_FAKULTAS_MASUK: [
    { key: 'namaPengaju', label: 'Nama Pengaju', sortable: true },
    { key: 'judulSurat', label: 'Judul Surat', sortable: true },
    { key: 'tipeSurat', label: 'Tipe Surat', sortable: true },
    { key: 'tanggalSurat', label: 'Tanggal Surat', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Aksi' },
  ],

  // [Lingkup Fakultas] Admin Surat Fakultas - Surat Keluar
  ADMIN_FAKULTAS_KELUAR: [
    { key: 'judulSurat', label: 'Judul Surat', sortable: true },
    { key: 'tipeSurat', label: 'Tipe Surat', sortable: true },
    { key: 'jenisSurat', label: 'Jenis Surat', sortable: true },
    { key: 'tanggalSurat', label: 'Tanggal Surat', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Aksi' },
  ],

  // [Lingkup Fakultas] Pejabat/Supervisor/Staf - Surat Masuk
  FAKULTAS_MASUK: [
    { key: 'namaPengaju', label: 'Nama Pengaju', sortable: true },
    { key: 'judulSurat', label: 'Judul Surat', sortable: true },
    { key: 'tipeSurat', label: 'Tipe Surat', sortable: true },
    { key: 'jenisSurat', label: 'Jenis Surat', sortable: true },
    { key: 'tanggalSurat', label: 'Tanggal Surat', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Aksi' },
  ],

  // [Lingkup Fakultas] Pejabat/Supervisor/Staf - Surat Keluar
  FAKULTAS_KELUAR: [
    { key: 'judulSurat', label: 'Judul Surat', sortable: true },
    { key: 'tipeSurat', label: 'Tipe Surat', sortable: true },
    { key: 'jenisSurat', label: 'Jenis Surat', sortable: true },
    { key: 'tanggalSurat', label: 'Tanggal Surat', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Aksi' },
  ],

  // [Lingkup Fakultas] UPA
  UPA: [
    { key: 'judulSurat', label: 'Judul Surat', sortable: true },
    { key: 'nomorSurat', label: 'Nomor Surat', sortable: true },
    { key: 'tipeSurat', label: 'Tipe Surat', sortable: true },
    { key: 'jenisSurat', label: 'Jenis Surat', sortable: true },
    { key: 'tanggalSurat', label: 'Tanggal Surat', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    { key: 'actions', label: 'Aksi' },
  ],
};

function getColumnsForRole(role: string, type?: 'masuk' | 'keluar'): DashboardColumn[] {
  // Lingkup Departemen
  if (role === ROLES.MAHASISWA || role === ROLES.DOSEN) {
    return COLUMNS.MAHASISWA_DOSEN;
  }

  if ([ROLES.KAPRODI, ROLES.ADMIN_PRODI, ROLES.KADEP].includes(role as any)) {
    return COLUMNS.DEPARTEMEN_STAFF;
  }

  // Lingkup Fakultas
  if (role === ROLES.ADMIN_FAKULTAS) {
    return type === 'keluar' ? COLUMNS.ADMIN_FAKULTAS_KELUAR : COLUMNS.ADMIN_FAKULTAS_MASUK;
  }

  if ([
    ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2,
    ROLES.MANAJER_TU, ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA,
    ROLES.STAF_AKADEMIK, ROLES.STAF_SUMBER_DAYA
  ].includes(role as any)) {
    return type === 'keluar' ? COLUMNS.FAKULTAS_KELUAR : COLUMNS.FAKULTAS_MASUK;
  }

  if (role === ROLES.UPA) {
    return COLUMNS.UPA;
  }

  return COLUMNS.MAHASISWA_DOSEN;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getActionsForItem(role: string, status: LetterStatus, currentActiveRole?: string | null): string[] {
  const actions: string[] = ['view'];

  switch (role) {
    case ROLES.MAHASISWA:
    case ROLES.DOSEN:
      if (status === LetterStatus.COMPLETED) {
        actions.push('download');
      }
      break;

    case ROLES.KAPRODI:
      if (status === LetterStatus.SUBMITTED || status === LetterStatus.KAPRODI_REVIEW) {
        actions.push('approve', 'reject');
      }
      if (status === LetterStatus.SURAT_PENGANTAR_REVIEW) {
        actions.push('sign');
      }
      if (status === LetterStatus.COMPLETED) {
        actions.push('download');
      }
      break;

    case ROLES.ADMIN_PRODI:
      if (status === LetterStatus.SURAT_PENGANTAR_DRAFT) {
        actions.push('draft');
      }
      if (status === LetterStatus.COMPLETED) {
        actions.push('download');
      }
      break;

    case ROLES.KADEP:
      // KADEP approval untuk prodi tanpa Kaprodi
      if (status === LetterStatus.SUBMITTED && currentActiveRole === ROLES.KADEP) {
        actions.push('approve', 'reject');
      }
      // KADEP signing surat pengantar
      if (status === LetterStatus.SURAT_PENGANTAR_REVIEW && currentActiveRole === ROLES.KADEP) {
        actions.push('sign');
      }
      if (status === LetterStatus.COMPLETED) {
        actions.push('download');
      }
      break;

    case ROLES.ADMIN_FAKULTAS:
      if (status === LetterStatus.SURAT_PENGANTAR_SIGNED || status === LetterStatus.FAKULTAS_RECEIVED) {
        actions.push('categorize', 'forward');
      }
      if (status === LetterStatus.COMPLETED) {
        actions.push('download');
      }
      break;

    case ROLES.DEKAN:
    case ROLES.WADEK_1:
    case ROLES.WADEK_2:
    case ROLES.MANAJER_TU:
      if (status === LetterStatus.FAKULTAS_DISPOSITION) {
        actions.push('disposisi', 'complete', 'return');
      }
      if (status === LetterStatus.FAKULTAS_VERIFICATION) {
        actions.push('verify', 'return');
      }
      if (status === LetterStatus.FAKULTAS_SIGNING) {
        actions.push('sign');
      }
      if (status === LetterStatus.COMPLETED) {
        actions.push('download');
      }
      break;

    case ROLES.SUPERVISOR_AKADEMIK:
    case ROLES.SUPERVISOR_SUMBER_DAYA:
      if (status === LetterStatus.FAKULTAS_DISPOSITION) {
        actions.push('disposisi', 'draft', 'return');
      }
      if (status === LetterStatus.FAKULTAS_VERIFICATION) {
        actions.push('verify', 'return');
      }
      if (status === LetterStatus.FAKULTAS_DRAFTING) {
        actions.push('draft', 'verify');
      }
      if (status === LetterStatus.COMPLETED) {
        actions.push('download');
      }
      break;

    case ROLES.STAF_AKADEMIK:
    case ROLES.STAF_SUMBER_DAYA:
      if (status === LetterStatus.FAKULTAS_DRAFTING) {
        actions.push('draft', 'submit');
      }
      if (status === LetterStatus.COMPLETED) {
        actions.push('download');
      }
      break;

    case ROLES.UPA:
      if (status === LetterStatus.UPA_NUMBERING) {
        actions.push('assign-number');
      }
      if (status === LetterStatus.UPA_STAMPING) {
        actions.push('stamp');
      }
      if (status === LetterStatus.UPA_FINALIZING) {
        actions.push('finalize');
      }
      if (status === LetterStatus.COMPLETED) {
        actions.push('download');
      }
      break;
  }

  return actions;
}

function getTipeSurat(letterTypeCode?: string, documentType?: string): string {
  // If document type is available, use it directly (most reliable)
  if (documentType) {
    if (documentType === 'SURAT_KEPUTUSAN') return 'Surat Keputusan';
    if (documentType === 'SURAT_TUGAS' || documentType === 'SURAT_TUGAS_TABEL') return 'Surat Tugas';
    if (documentType === 'SURAT_PENGANTAR') return 'Surat Pengantar';
  }

  if (!letterTypeCode) return '-';

  // For STAFF_DIRECT codes, we can't reliably determine from letterType.code alone
  // because all STAFF_DIRECT_* codes contain 'ST' (from STAFF)
  // Fall back to checking for explicit SK/ST patterns (non-STAFF_DIRECT)
  if (!letterTypeCode.startsWith('STAFF_DIRECT_')) {
    if (letterTypeCode.includes('SK')) return 'Surat Keputusan';
    if (letterTypeCode.includes('ST')) return 'Surat Tugas';
  }

  return letterTypeCode;
}

/**
 * Get unique display statuses from mapped items (dinamis)
 */
function getUniqueDisplayStatuses(items: DashboardItem[]): string[] {
  const statuses = new Set<string>();
  items.forEach(item => {
    statuses.add(item.displayStatus);
  });
  return Array.from(statuses).sort((a, b) => {
    // Sort by priority
    const priority: Record<string, number> = {
      'MENUNGGU ANDA': 1,
      'MENUNGGU DIVERIFIKASI': 2,
      'MENUNGGU DITANDATANGANI': 3,
      'DIPROSES': 4,
      'SELESAI': 5,
      'DIKEMBALIKAN': 6,
      'DIKEMBALIKAN KE PENGAJU': 7,
      'DITOLAK': 8,
    };
    return (priority[a] || 999) - (priority[b] || 999);
  });
}

// ============================================================================
// DASHBOARD QUERY BUILDERS
// ============================================================================

/**
 * Dashboard untuk Mahasiswa/Dosen (Pengaju)
 */
async function getDashboardPengaju(
  user: DashboardUser,
  filters: DashboardFilters
): Promise<DashboardResult> {
  const page = parseInt(filters.page || '1', 10);
  const limit = parseInt(filters.limit || '5', 10); // Default 5 rows per page
  const offset = (page - 1) * limit;

  const where: any = {
    createdById: user.id,
  };

  if (filters.status) {
    where.status = filters.status as LetterStatus;
  }

  if (filters.search) {
    where.OR = [
      { documents: { some: { perihal: { contains: filters.search, mode: 'insensitive' } } } },
    ];
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      // Set to end of day (23:59:59.999) to include all data on that day
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = endDate;
    }
  }

  // Fetch ALL items first (without pagination) to apply displayStatus filter
  const allItems = await db.letterInstance.findMany({
    where,
    include: {
      letterType: {
        select: {
          code: true,
          category: true,
        },
      },
      documents: { take: 1 },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Map items with displayStatus
  let mappedItems: DashboardItem[] = allItems.map((item) => ({
    id: item.id,
    judulSurat: item.documents[0]?.perihal || (item.submissionValues as any)?.judulAcara || '-',
    tipeSurat: getTipeSurat(item.letterType?.code, item.documents[0]?.type),
    tanggalSurat: item.createdAt,
    status: item.status,
    displayStatus: getDisplayStatusForRole(item.status, user.role, item.currentActiveRole),
    actions: getActionsForItem(user.role, item.status, item.currentActiveRole),
  }));

  // Get unique statuses BEFORE applying displayStatus filter (untuk dropdown)
  const allAvailableStatuses = getUniqueDisplayStatuses(mappedItems);

  // Apply displayStatus filter if provided
  if (filters.displayStatus) {
    mappedItems = mappedItems.filter(item =>
      item.displayStatus.toUpperCase() === filters.displayStatus!.toUpperCase()
    );
  }

  // Sort by displayStatus priority (MENUNGGU > DIPROSES > SELESAI > DIKEMBALIKAN > DITOLAK)
  mappedItems = sortByDisplayStatusPriority(mappedItems);

  // Calculate total AFTER displayStatus filter
  const total = mappedItems.length;

  // Apply pagination AFTER filter
  const paginatedItems = mappedItems.slice(offset, offset + limit);

  const [pending, completed] = await Promise.all([
    db.letterInstance.count({
      where: {
        createdById: user.id,
        status: { notIn: [LetterStatus.COMPLETED, LetterStatus.REJECTED, LetterStatus.CANCELLED] },
      },
    }),
    db.letterInstance.count({
      where: { createdById: user.id, status: LetterStatus.COMPLETED },
    }),
  ]);

  return {
    columns: getColumnsForRole(user.role),
    items: paginatedItems,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    statistics: { total: allItems.length, pending, completed, waiting: 0 },
    filters: { status: allAvailableStatuses },
  };
}

/**
 * Dashboard untuk Lingkup Departemen (Kaprodi, Admin Prodi, Kadep)
 */
async function getDashboardDepartemen(
  user: DashboardUser,
  filters: DashboardFilters
): Promise<DashboardResult> {
  const page = parseInt(filters.page || '1', 10);
  const limit = parseInt(filters.limit || '5', 10); // Default 5 rows per page
  const offset = (page - 1) * limit;

  const where: any = {};

  // Filter berdasarkan program studi user (baik dari mahasiswa maupun pegawai)
  // Untuk KAPRODI dan ADMIN_PRODI: filter by programStudiId
  // Untuk KADEP: filter by departemenId (semua prodi di departemen) via join ke ProgramStudi
  if (user.role === ROLES.KADEP && user.departemenId) {
    where.createdBy = {
      OR: [
        { mahasiswa: { programStudi: { departemenId: user.departemenId } } },
        { pegawai: { programStudi: { departemenId: user.departemenId } } },
      ],
    };
  } else if (user.programStudiId) {
    where.createdBy = {
      OR: [
        { mahasiswa: { programStudiId: user.programStudiId } },
        { pegawai: { programStudiId: user.programStudiId } },
      ],
    };
  }

  // Filter status sesuai role
  switch (user.role) {
    case ROLES.KAPRODI:
      where.status = {
        in: [
          LetterStatus.SUBMITTED,
          LetterStatus.KAPRODI_REVIEW,
          LetterStatus.SURAT_PENGANTAR_DRAFT,
          LetterStatus.SURAT_PENGANTAR_REVIEW,
          LetterStatus.SURAT_PENGANTAR_SIGNED,
          LetterStatus.FAKULTAS_RECEIVED,
          LetterStatus.FAKULTAS_DISPOSITION,
          LetterStatus.SURAT_DIBUAT, // PERBAIKAN: Tambahkan status SURAT_DIBUAT
          LetterStatus.FAKULTAS_DRAFTING,
          LetterStatus.FAKULTAS_VERIFICATION,
          LetterStatus.FAKULTAS_SIGNING,
          LetterStatus.UPA_NUMBERING,
          LetterStatus.UPA_STAMPING,
          LetterStatus.UPA_FINALIZING,
          LetterStatus.COMPLETED,
          LetterStatus.REJECTED,
          LetterStatus.CANCELLED,
        ],
      };
      break;

    case ROLES.ADMIN_PRODI:
      where.status = {
        in: [
          LetterStatus.SURAT_PENGANTAR_DRAFT,
          LetterStatus.SURAT_PENGANTAR_REVIEW,
          LetterStatus.SURAT_PENGANTAR_SIGNED,
          LetterStatus.FAKULTAS_RECEIVED,
          LetterStatus.FAKULTAS_DISPOSITION,
          LetterStatus.SURAT_DIBUAT, // PERBAIKAN: Tambahkan status SURAT_DIBUAT
          LetterStatus.FAKULTAS_DRAFTING,
          LetterStatus.FAKULTAS_VERIFICATION,
          LetterStatus.FAKULTAS_SIGNING,
          LetterStatus.UPA_NUMBERING,
          LetterStatus.UPA_STAMPING,
          LetterStatus.UPA_FINALIZING,
          LetterStatus.COMPLETED,
          LetterStatus.CANCELLED,
        ],
      };
      break;

    case ROLES.KADEP:
      where.status = {
        in: [
          LetterStatus.SUBMITTED, // Tambahkan ini untuk prodi tanpa Kaprodi
          LetterStatus.SURAT_PENGANTAR_DRAFT, // PERBAIKAN: Surat tetap muncul setelah KADEP approve
          LetterStatus.SURAT_PENGANTAR_REVIEW,
          LetterStatus.SURAT_PENGANTAR_SIGNED,
          LetterStatus.FAKULTAS_RECEIVED,
          LetterStatus.FAKULTAS_DISPOSITION,
          LetterStatus.SURAT_DIBUAT, // PERBAIKAN: Tambahkan status SURAT_DIBUAT
          LetterStatus.FAKULTAS_DRAFTING,
          LetterStatus.FAKULTAS_VERIFICATION,
          LetterStatus.FAKULTAS_SIGNING,
          LetterStatus.UPA_NUMBERING,
          LetterStatus.UPA_STAMPING,
          LetterStatus.UPA_FINALIZING,
          LetterStatus.COMPLETED,
          LetterStatus.REJECTED, // PERBAIKAN: Surat tetap muncul setelah KADEP reject
          LetterStatus.CANCELLED,
        ],
      };
      break;
  }

  if (filters.status) {
    where.status = filters.status as LetterStatus;
  }

  if (filters.search) {
    const searchCondition = {
      OR: [
        { documents: { some: { perihal: { contains: filters.search, mode: 'insensitive' } } } },
        { createdBy: { name: { contains: filters.search, mode: 'insensitive' } } },
      ]
    };

    // Combine with existing filters using AND
    if (where.AND) {
      where.AND.push(searchCondition);
    } else {
      where.AND = [searchCondition];
    }
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = endDate;
    }
  }

  // Fetch all items matching the filter
  const allItems = await db.letterInstance.findMany({
    where,
    include: {
      letterType: {
        select: {
          code: true,
          name: true,
        },
      },
      documents: {
        select: {
          type: true,
          perihal: true,
        },
        take: 1,
      },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Map items with displayStatus
  let mappedItems: DashboardItem[] = allItems.map((item) => ({
    id: item.id,
    namaPengaju: item.createdBy?.name || '-',
    judulSurat: item.documents[0]?.perihal || (item.submissionValues as any)?.judulAcara || '-',
    tipeSurat: getTipeSurat(item.letterType?.code, item.documents[0]?.type),
    tanggalSurat: item.createdAt,
    status: item.status,
    displayStatus: getDisplayStatusForRole(item.status, user.role, item.currentActiveRole),
    actions: getActionsForItem(user.role, item.status, item.currentActiveRole),
  }));

  // Get unique statuses BEFORE applying displayStatus filter (untuk dropdown)
  const allAvailableStatuses = getUniqueDisplayStatuses(mappedItems);

  // Apply displayStatus filter if provided
  if (filters.displayStatus) {
    mappedItems = mappedItems.filter(item =>
      item.displayStatus.toUpperCase() === filters.displayStatus!.toUpperCase()
    );
  }

  // Sort by displayStatus priority (MENUNGGU > DIPROSES > SELESAI > DIKEMBALIKAN > DITOLAK)
  mappedItems = sortByDisplayStatusPriority(mappedItems);

  // Calculate totals AFTER displayStatus filter
  const total = mappedItems.length;

  // Apply pagination AFTER filter
  const paginatedItems = mappedItems.slice(offset, offset + limit);

  const waiting = mappedItems.filter((item) => {
    return item.displayStatus.includes('MENUNGGU');
  }).length;

  return {
    columns: getColumnsForRole(user.role),
    items: paginatedItems,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    statistics: {
      total: allItems.length,
      pending: allItems.filter((i) => i.status !== LetterStatus.COMPLETED).length,
      completed: allItems.filter((i) => i.status === LetterStatus.COMPLETED).length,
      waiting,
    },
    filters: { status: allAvailableStatuses },
  };
}

/**
 * Dashboard untuk Lingkup Fakultas (Admin Fakultas, Pejabat, Supervisor, Staf)
 * 
 * PERBAIKAN: Surat tidak hilang setelah role menyelesaikan aksinya
 * - Menampilkan surat yang sedang aktif (currentActiveRole = user.role)
 * - JUGA menampilkan surat yang pernah ditangani (via LetterLog)
 */
async function getDashboardFakultas(
  user: DashboardUser,
  filters: DashboardFilters
): Promise<DashboardResult> {
  const page = parseInt(filters.page || '1', 10);
  const limit = parseInt(filters.limit || '5', 10); // Default 5 rows per page
  const offset = (page - 1) * limit;
  const type = filters.type || 'masuk';

  // Check if user is a pejabat/supervisor/staf (not Admin Fakultas)
  const isPejabatOrBelow = [
    ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2,
    ROLES.MANAJER_TU, ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA,
    ROLES.STAF_AKADEMIK, ROLES.STAF_SUMBER_DAYA
  ].includes(user.role as any);

  // Build query conditions
  let where: any = {};

  if (type === 'masuk') {
    if (user.role === ROLES.ADMIN_FAKULTAS) {
      // Admin Fakultas - tampilkan surat yang aktif DAN yang sudah diproses
      where.OR = [
        // Surat yang sedang aktif untuk Admin Fakultas
        {
          status: {
            in: [
              LetterStatus.SURAT_PENGANTAR_SIGNED,
              LetterStatus.FAKULTAS_RECEIVED,
            ],
          },
          currentActiveRole: ROLES.ADMIN_FAKULTAS,
        },
        // Surat yang sudah pernah diproses oleh Admin Fakultas (sudah forward)
        {
          logs: {
            some: {
              actorRole: ROLES.ADMIN_FAKULTAS,
              action: { in: [LogAction.DISPOSITION, LogAction.APPROVE, LogAction.VERIFY, LogAction.STATUS_CHANGE] },
            },
          },
          status: {
            in: [
              LetterStatus.FAKULTAS_DISPOSITION,
              LetterStatus.FAKULTAS_VERIFICATION,
              LetterStatus.FAKULTAS_SIGNING,
              LetterStatus.FAKULTAS_DRAFTING,
              LetterStatus.UPA_NUMBERING,
              LetterStatus.UPA_STAMPING,
              LetterStatus.UPA_FINALIZING,
              LetterStatus.COMPLETED,
              LetterStatus.REJECTED,
              LetterStatus.CANCELLED,
            ],
          },
        },
      ];
    } else if (isPejabatOrBelow) {
      // Pejabat/Supervisor/Staf - tampilkan surat yang aktif DAN yang sudah diproses
      where.OR = [
        // Surat yang sedang aktif untuk role ini
        {
          status: {
            in: [
              LetterStatus.FAKULTAS_DISPOSITION,
              LetterStatus.SURAT_DIBUAT, // PERBAIKAN: Include SURAT_DIBUAT untuk staff
              LetterStatus.FAKULTAS_VERIFICATION,
              LetterStatus.FAKULTAS_SIGNING,
              LetterStatus.FAKULTAS_DRAFTING,
            ],
          },
          currentActiveRole: user.role,
          // FIX: Hanya tampilkan surat masuk (BUKAN staff-created)
          letterType: {
            code: { not: { startsWith: 'STAFF_DIRECT_' } }
          }
        },
        // Surat yang pernah ditangani oleh role ini (via LetterLog)
        {
          logs: {
            some: {
              actorRole: user.role,
              action: { in: [LogAction.DISPOSITION, LogAction.APPROVE, LogAction.VERIFY, LogAction.SIGN, LogAction.DRAFT_CREATE, LogAction.DRAFT_UPDATE, LogAction.SUBMIT] },
            },
          },
          status: {
            notIn: [LetterStatus.SUBMITTED, LetterStatus.KAPRODI_REVIEW], // Exclude surat yang masih di tingkat prodi
          },
          // FIX: Hanya tampilkan surat masuk (BUKAN staff-created)
          letterType: {
            code: { not: { startsWith: 'STAFF_DIRECT_' } }
          }
        },
      ];
    }
  } else {
    // Surat Keluar = surat hasil (ST/SK)
    if (user.role === ROLES.ADMIN_FAKULTAS) {
      where.OR = [
        // Surat keluar yang aktif
        {
          status: {
            in: [
              LetterStatus.FAKULTAS_DRAFTING,
              LetterStatus.FAKULTAS_VERIFICATION,
              LetterStatus.FAKULTAS_SIGNING,
              LetterStatus.UPA_NUMBERING,
              LetterStatus.UPA_STAMPING,
              LetterStatus.UPA_FINALIZING,
              LetterStatus.COMPLETED,
            ],
          },
        },
      ];
    } else if (isPejabatOrBelow) {
      where.OR = [
        // Surat keluar yang aktif untuk role ini
        {
          status: {
            in: [
              LetterStatus.SURAT_DIBUAT, // PERBAIKAN: Include SURAT_DIBUAT (siap untuk drafting)
              LetterStatus.FAKULTAS_DRAFTING,
              LetterStatus.FAKULTAS_VERIFICATION,
              LetterStatus.FAKULTAS_SIGNING,
              LetterStatus.UPA_NUMBERING,
              LetterStatus.UPA_STAMPING,
              LetterStatus.UPA_FINALIZING,
              LetterStatus.COMPLETED,
            ],
          },
          currentActiveRole: user.role,
          // FIX: Hanya tampilkan surat yang:
          // 1. Dibuat langsung oleh staff (STAFF_DIRECT_*), ATAU
          // 2. Sudah memiliki dokumen SK/ST (berarti sudah di-draft)
          OR: [
            {
              letterType: {
                code: { startsWith: 'STAFF_DIRECT_' }
              }
            },
            {
              documents: {
                some: {
                  type: { in: ['SURAT_KEPUTUSAN', 'SURAT_TUGAS', 'SURAT_TUGAS_TABEL'] }
                }
              }
            }
          ]
        },
        // Surat keluar yang pernah ditangani oleh role ini
        {
          logs: {
            some: {
              actorRole: user.role,
              action: { in: [LogAction.DISPOSITION, LogAction.APPROVE, LogAction.VERIFY, LogAction.SIGN, LogAction.DRAFT_CREATE, LogAction.DRAFT_UPDATE, LogAction.SUBMIT] },
            },
          },
          status: {
            in: [
              LetterStatus.FAKULTAS_DRAFTING,
              LetterStatus.FAKULTAS_VERIFICATION,
              LetterStatus.FAKULTAS_SIGNING,
              LetterStatus.UPA_NUMBERING,
              LetterStatus.UPA_STAMPING,
              LetterStatus.UPA_FINALIZING,
              LetterStatus.COMPLETED,
            ],
          },
          // FIX: Same filter untuk historical letters
          OR: [
            {
              letterType: {
                code: { startsWith: 'STAFF_DIRECT_' }
              }
            },
            {
              documents: {
                some: {
                  type: { in: ['SURAT_KEPUTUSAN', 'SURAT_TUGAS', 'SURAT_TUGAS_TABEL'] }
                }
              }
            }
          ]
        },
      ];
    }
  }

  if (filters.status) {
    // Jika ada filter status spesifik, override OR condition
    where = {
      ...where,
      status: filters.status as LetterStatus,
    };
  }

  if (filters.search) {
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { documents: { some: { perihal: { contains: filters.search, mode: 'insensitive' } } } },
          { createdBy: { name: { contains: filters.search, mode: 'insensitive' } } },
        ],
      },
    ];
  }

  if (filters.dateFrom || filters.dateTo) {
    where.AND = where.AND || [];
    if (filters.dateFrom) {
      where.AND.push({ createdAt: { gte: new Date(filters.dateFrom) } });
    }
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      where.AND.push({ createdAt: { lte: endDate } });
    }
  }

  // Build count query conditions untuk menghitung berdasarkan role
  const buildCountQuery = (statusList: LetterStatus[]) => {
    if (user.role === ROLES.ADMIN_FAKULTAS) {
      return {
        OR: [
          { status: { in: statusList }, currentActiveRole: ROLES.ADMIN_FAKULTAS },
          { status: { in: statusList }, logs: { some: { actorRole: ROLES.ADMIN_FAKULTAS } } },
        ],
      };
    } else if (isPejabatOrBelow) {
      return {
        OR: [
          { status: { in: statusList }, currentActiveRole: user.role },
          { status: { in: statusList }, logs: { some: { actorRole: user.role } } },
        ],
      };
    }
    return { status: { in: statusList } };
  };

  // Fetch ALL items first (without pagination) to apply displayStatus filter
  const [allItems, masukCount, keluarCount] = await Promise.all([
    db.letterInstance.findMany({
      where,
      select: {
        id: true,
        status: true,
        currentActiveRole: true,
        category: true,
        createdAt: true,
        submissionValues: true,
        letterType: {
          select: {
            code: true,
            category: true,
          },
        },
        documents: {
          select: {
            type: true,
            perihal: true,
          },
        },
        createdBy: { select: { id: true, name: true } },
        logs: {
          select: { actorRole: true },
          where: { actorRole: user.role },
          take: 1, // Hanya perlu tahu apakah ada
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.letterInstance.count({
      where: buildCountQuery([
        LetterStatus.SURAT_PENGANTAR_SIGNED,
        LetterStatus.FAKULTAS_RECEIVED,
        LetterStatus.FAKULTAS_DISPOSITION,
        LetterStatus.FAKULTAS_VERIFICATION,
        LetterStatus.FAKULTAS_SIGNING,
      ]),
    }),
    db.letterInstance.count({
      where: buildCountQuery([
        LetterStatus.FAKULTAS_DRAFTING,
        LetterStatus.UPA_NUMBERING,
        LetterStatus.UPA_STAMPING,
        LetterStatus.UPA_FINALIZING,
        LetterStatus.COMPLETED,
      ]),
    }),
  ]);

  // Map items with displayStatus
  let mappedItems: DashboardItem[] = allItems.map((item) => {
    const pengantarDoc = item.documents.find(d => d.type === 'SURAT_PENGANTAR');
    const hasilDoc = item.documents.find(d => d.type === 'SURAT_KEPUTUSAN' || d.type === 'SURAT_TUGAS' || d.type === 'SURAT_TUGAS_TABEL');
    const doc = type === 'masuk' ? pengantarDoc : (hasilDoc || pengantarDoc);

    // Untuk Surat Masuk: jika surat keluar (SK/ST) sudah dibuat, 
    // status di tabel surat masuk menjadi "SELESAI" karena proses sudah berlanjut ke surat keluar
    let displayStatus = getDisplayStatusForRole(item.status, user.role, item.currentActiveRole);
    if (type === 'masuk' && hasilDoc) {
      displayStatus = 'SELESAI';
    }

    return {
      id: item.id,
      namaPengaju: item.createdBy?.name || '-',
      judulSurat: doc?.perihal || (item.submissionValues as any)?.judulAcara || '-',
      tipeSurat: getTipeSurat(item.letterType?.code, (hasilDoc || doc)?.type),
      jenisSurat: item.category || item.letterType?.category || '-',
      tanggalSurat: item.createdAt,
      status: item.status,
      displayStatus,
      actions: getActionsForItem(user.role, item.status, item.currentActiveRole),
    };
  });

  // Apply displayStatus filter if provided
  if (filters.displayStatus) {
    mappedItems = mappedItems.filter(item =>
      item.displayStatus.toUpperCase() === filters.displayStatus!.toUpperCase()
    );
  }

  // Sort by displayStatus priority (MENUNGGU > DIPROSES > SELESAI > DIKEMBALIKAN > DITOLAK)
  mappedItems = sortByDisplayStatusPriority(mappedItems);

  // Calculate total AFTER displayStatus filter
  const total = mappedItems.length;

  // Apply pagination AFTER filter
  const paginatedItems = mappedItems.slice(offset, offset + limit);

  const waiting = mappedItems.filter((item) => {
    return item.displayStatus.includes('MENUNGGU');
  }).length;

  // Get unique statuses BEFORE applying displayStatus filter (untuk dropdown)
  const mapItemsBeforeFilter: DashboardItem[] = allItems.map((item) => {
    const pengantarDoc = item.documents.find(d => d.type === 'SURAT_PENGANTAR');
    const hasilDoc = item.documents.find(d => d.type === 'SURAT_KEPUTUSAN' || d.type === 'SURAT_TUGAS' || d.type === 'SURAT_TUGAS_TABEL');
    const doc = type === 'masuk' ? pengantarDoc : (hasilDoc || pengantarDoc);

    let displayStatus = getDisplayStatusForRole(item.status, user.role, item.currentActiveRole);
    if (type === 'masuk' && hasilDoc) {
      displayStatus = 'SELESAI';
    }

    return {
      id: item.id,
      namaPengaju: item.createdBy?.name || '-',
      judulSurat: doc?.perihal || (item.submissionValues as any)?.judulAcara || '-',
      tipeSurat: getTipeSurat(item.letterType?.code, (hasilDoc || doc)?.type),
      jenisSurat: item.category || item.letterType?.category || '-',
      tanggalSurat: item.createdAt,
      status: item.status,
      displayStatus,
      actions: getActionsForItem(user.role, item.status, item.currentActiveRole),
    };
  });

  const allAvailableStatuses = getUniqueDisplayStatuses(mapItemsBeforeFilter);

  return {
    columns: getColumnsForRole(user.role, type),
    items: paginatedItems,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    statistics: {
      total: allItems.length,
      pending: allItems.filter((i) => i.status !== LetterStatus.COMPLETED).length,
      completed: allItems.filter((i) => i.status === LetterStatus.COMPLETED).length,
      waiting,
    },
    tabs: [
      { key: 'masuk', label: 'Surat Masuk', count: masukCount },
      { key: 'keluar', label: 'Surat Keluar', count: keluarCount },
    ],
    filters: { status: allAvailableStatuses },
  };
}

/**
 * Dashboard untuk UPA
 */
async function getDashboardUPA(
  user: DashboardUser,
  filters: DashboardFilters
): Promise<DashboardResult> {
  const page = parseInt(filters.page || '1', 10);
  const limit = parseInt(filters.limit || '5', 10); // Default 5 rows per page
  const offset = (page - 1) * limit;

  const where: any = {
    status: {
      in: [
        LetterStatus.UPA_NUMBERING,
        LetterStatus.UPA_STAMPING,
        LetterStatus.UPA_FINALIZING,
        LetterStatus.COMPLETED,
      ],
    },
  };

  if (filters.status) {
    where.status = filters.status as LetterStatus;
  }

  if (filters.search) {
    where.OR = [
      { documents: { some: { perihal: { contains: filters.search, mode: 'insensitive' } } } },
      { documents: { some: { nomorSurat: { contains: filters.search, mode: 'insensitive' } } } },
    ];
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = endDate;
    }
  }

  // Fetch ALL items first (without pagination) to apply displayStatus filter
  const [allItems, penomoran, stempel, finalisasi, completed] = await Promise.all([
    db.letterInstance.findMany({
      where,
      select: {
        id: true,
        status: true,
        currentActiveRole: true,
        category: true,
        createdAt: true,
        submissionValues: true,
        letterType: {
          select: {
            code: true,
            category: true,
          },
        },
        documents: {
          select: {
            type: true,
            perihal: true,
            nomorSurat: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.letterInstance.count({ where: { status: LetterStatus.UPA_NUMBERING } }),
    db.letterInstance.count({ where: { status: LetterStatus.UPA_STAMPING } }),
    db.letterInstance.count({ where: { status: LetterStatus.UPA_FINALIZING } }),
    db.letterInstance.count({
      where: {
        status: LetterStatus.COMPLETED,
        completedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
  ]);

  // Map items with displayStatus
  let mappedItems: DashboardItem[] = allItems.map((item) => {
    const hasilDoc = item.documents.find(d => d.type === 'SURAT_KEPUTUSAN' || d.type === 'SURAT_TUGAS' || d.type === 'SURAT_TUGAS_TABEL');

    return {
      id: item.id,
      judulSurat: hasilDoc?.perihal || (item.submissionValues as any)?.judulAcara || '-',
      nomorSurat: hasilDoc?.nomorSurat || '-',
      tipeSurat: getTipeSurat(item.letterType?.code, hasilDoc?.type),
      jenisSurat: item.category || item.letterType?.category || '-',
      tanggalSurat: item.createdAt,
      status: item.status,
      displayStatus: getDisplayStatusForRole(item.status, user.role, item.currentActiveRole),
      actions: getActionsForItem(user.role, item.status, item.currentActiveRole),
    };
  });

  // Get unique statuses BEFORE applying displayStatus filter (untuk dropdown)
  const allAvailableStatuses = getUniqueDisplayStatuses(mappedItems);

  // Apply displayStatus filter if provided
  if (filters.displayStatus) {
    mappedItems = mappedItems.filter(item =>
      item.displayStatus.toUpperCase() === filters.displayStatus!.toUpperCase()
    );
  }

  // Sort by displayStatus priority (MENUNGGU > DIPROSES > SELESAI > DIKEMBALIKAN > DITOLAK)
  mappedItems = sortByDisplayStatusPriority(mappedItems);

  // Calculate total AFTER displayStatus filter
  const total = mappedItems.length;

  // Apply pagination AFTER filter
  const paginatedItems = mappedItems.slice(offset, offset + limit);

  return {
    columns: getColumnsForRole(user.role),
    items: paginatedItems,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    statistics: {
      total: penomoran + stempel + finalisasi,
      pending: penomoran + stempel + finalisasi,
      completed,
      waiting: penomoran + stempel + finalisasi,
    },
    tabs: [
      { key: 'penomoran', label: 'Penomoran', count: penomoran },
      { key: 'stempel', label: 'Stempel', count: stempel },
      { key: 'finalisasi', label: 'Finalisasi', count: finalisasi },
    ],
    filters: { status: allAvailableStatuses },
  };
}

// ============================================================================
// ROUTES
// ============================================================================

export default new Elysia()
  .use(authGuardPlugin)

  /**
   * GET /dash
   * Dashboard utama berdasarkan role user
   */
  .get('/', async ({ user, query }) => {
    const roles = await getUserRoles(user.id);
    const primaryRole = roles[0] || ROLES.MAHASISWA;

    // Get user details
    const userDetails = await db.user.findUnique({
      where: { id: user.id },
      include: {
        mahasiswa: {
          select: {
            departemenId: true,
            programStudiId: true,
            programStudi: {
              select: {
                departemenId: true,
              },
            },
          }
        },
        pegawai: {
          select: {
            programStudiId: true,
            programStudi: {
              select: {
                departemenId: true,
              },
            },
          }
        },
      },
    });

    const dashboardUser: DashboardUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: primaryRole,
      departemenId: userDetails?.mahasiswa?.programStudi?.departemenId || userDetails?.pegawai?.programStudi?.departemenId,
      programStudiId: userDetails?.mahasiswa?.programStudiId || userDetails?.pegawai?.programStudiId,
    };

    const filters: DashboardFilters = {
      status: query.status,
      type: query.type as 'masuk' | 'keluar' | undefined,
      documentType: query.documentType,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search,
      page: query.page,
      limit: query.limit,
      displayStatus: query.displayStatus,
    };

    let result: DashboardResult;

    // Route ke dashboard sesuai role
    switch (primaryRole) {
      case ROLES.MAHASISWA:
      case ROLES.DOSEN:
        result = await getDashboardPengaju(dashboardUser, filters);
        break;

      case ROLES.KAPRODI:
      case ROLES.ADMIN_PRODI:
      case ROLES.KADEP:
        result = await getDashboardDepartemen(dashboardUser, filters);
        break;

      case ROLES.ADMIN_FAKULTAS:
      case ROLES.DEKAN:
      case ROLES.WADEK_1:
      case ROLES.WADEK_2:
      case ROLES.MANAJER_TU:
      case ROLES.SUPERVISOR_AKADEMIK:
      case ROLES.SUPERVISOR_SUMBER_DAYA:
      case ROLES.STAF_AKADEMIK:
      case ROLES.STAF_SUMBER_DAYA:
        result = await getDashboardFakultas(dashboardUser, filters);
        break;

      case ROLES.UPA:
        result = await getDashboardUPA(dashboardUser, filters);
        break;

      default:
        result = await getDashboardPengaju(dashboardUser, filters);
    }

    return {
      success: true,
      message: 'Berhasil mengambil dashboard',
      data: {
        ...result,
        userRole: primaryRole,
      },
    };
  }, {
    query: t.Object({
      status: t.Optional(t.String()),
      type: t.Optional(t.Union([t.Literal('masuk'), t.Literal('keluar')])),
      documentType: t.Optional(t.String()),
      dateFrom: t.Optional(t.String()),
      dateTo: t.Optional(t.String()),
      search: t.Optional(t.String()),
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      displayStatus: t.Optional(t.String()),
    }),
    detail: {
      tags: ['Dashboard'],
      summary: 'Get unified dashboard',
      description: 'Mengambil dashboard sesuai role user dengan filter dan statistik',
    },
  })

  /**
   * GET /dash/statistics
   * Statistik dashboard
   */
  .get('/statistics', async ({ user }) => {
    const roles = await getUserRoles(user.id);
    const primaryRole = roles[0] || ROLES.MAHASISWA;

    const [total, pending, completed, thisMonth] = await Promise.all([
      db.letterInstance.count(),
      db.letterInstance.count({
        where: { status: { notIn: [LetterStatus.COMPLETED, LetterStatus.REJECTED, LetterStatus.CANCELLED] } },
      }),
      db.letterInstance.count({ where: { status: LetterStatus.COMPLETED } }),
      db.letterInstance.count({
        where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      }),
    ]);

    return {
      success: true,
      message: 'Berhasil mengambil statistik',
      data: { total, pending, completed, thisMonth, role: primaryRole },
    };
  }, {
    detail: {
      tags: ['Dashboard'],
      summary: 'Get dashboard statistics',
      description: 'Mengambil statistik dashboard',
    },
  })

  /**
   * GET /dash/recent
   * Aktivitas terbaru
   */
  .get('/recent', async ({ user }) => {
    const recentLogs = await db.letterLog.findMany({
      include: {
        letterInstance: {
          include: {
            letterType: {
              select: {
                name: true,
                code: true,
                category: true,
              },
            },
            documents: { take: 1 },
          },
        },
        actor: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const activities = recentLogs.map((log) => ({
      id: log.id,
      action: log.action,
      notes: log.notes,
      letterTitle: log.letterInstance?.documents[0]?.perihal ||
        (log.letterInstance?.submissionValues as any)?.judulAcara || '-',
      documentType: log.letterInstance?.letterType?.name,
      actorName: log.actor?.name,
      timestamp: log.createdAt,
    }));

    return {
      success: true,
      message: 'Berhasil mengambil aktivitas terbaru',
      data: activities,
    };
  }, {
    detail: {
      tags: ['Dashboard'],
      summary: 'Get recent activities',
      description: 'Mengambil aktivitas terbaru',
    },
  });
