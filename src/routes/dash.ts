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
import { LetterStatus } from '../generated/prisma/enums';
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
  | 'MENUNGGU DITANDATANGANI';

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
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
    if (status === LetterStatus.CANCELLED) return 'DIKEMBALIKAN KE PENGAJU';
    return 'DIPROSES';
  }

  // AKTOR 4: KETUA DEPARTEMEN
  if (role === ROLES.KADEP) {
    if (status === LetterStatus.SURAT_PENGANTAR_REVIEW && currentActiveRole === ROLES.KADEP) {
      return 'MENUNGGU DITANDATANGANI';
    }
    if (status === LetterStatus.COMPLETED) return 'SELESAI';
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
    if (status === LetterStatus.FAKULTAS_DRAFTING && currentActiveRole === role) {
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

function getActionsForItem(role: string, status: LetterStatus): string[] {
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
      if (status === LetterStatus.SURAT_PENGANTAR_REVIEW) {
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

function getTipeSurat(letterTypeCode?: string): string {
  if (!letterTypeCode) return '-';
  if (letterTypeCode.includes('SK')) return 'Surat Keputusan';
  if (letterTypeCode.includes('ST')) return 'Surat Tugas';
  return letterTypeCode;
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
  const limit = parseInt(filters.limit || '20', 10);
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
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const [items, total] = await Promise.all([
    db.letterInstance.findMany({
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
      skip: offset,
      take: limit,
    }),
    db.letterInstance.count({ where }),
  ]);

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

  const mappedItems: DashboardItem[] = items.map((item) => ({
    id: item.id,
    judulSurat: item.documents[0]?.perihal || (item.submissionValues as any)?.judulAcara || '-',
    tipeSurat: getTipeSurat(item.letterType?.code),
    tanggalSurat: item.createdAt,
    status: item.status,
    displayStatus: getDisplayStatusForRole(item.status, user.role, item.currentActiveRole),
    actions: getActionsForItem(user.role, item.status),
  }));

  return {
    columns: getColumnsForRole(user.role),
    items: mappedItems,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    statistics: { total, pending, completed, waiting: 0 },
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
  const limit = parseInt(filters.limit || '20', 10);
  const offset = (page - 1) * limit;

  const where: any = {};

  // Filter berdasarkan program studi user
  if (user.programStudiId) {
    where.createdBy = {
      mahasiswa: { programStudiId: user.programStudiId },
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
          LetterStatus.SURAT_PENGANTAR_REVIEW,
          LetterStatus.SURAT_PENGANTAR_SIGNED,
          LetterStatus.FAKULTAS_RECEIVED,
          LetterStatus.FAKULTAS_DISPOSITION,
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
      // Khusus untuk ttd, filter yang currentActiveRole = KADEP
      break;
  }

  if (filters.status) {
    where.status = filters.status as LetterStatus;
  }

  if (filters.search) {
    where.OR = [
      { documents: { some: { perihal: { contains: filters.search, mode: 'insensitive' } } } },
      { createdBy: { name: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const [items, total] = await Promise.all([
    db.letterInstance.findMany({
      where,
      include: {
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
          take: 1,
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    db.letterInstance.count({ where }),
  ]);

  const waiting = items.filter((item) => {
    const displayStatus = getDisplayStatusForRole(item.status, user.role, item.currentActiveRole);
    return displayStatus.includes('MENUNGGU');
  }).length;

  const mappedItems: DashboardItem[] = items.map((item) => ({
    id: item.id,
    namaPengaju: item.createdBy?.name || '-',
    judulSurat: item.documents[0]?.perihal || (item.submissionValues as any)?.judulAcara || '-',
    tipeSurat: getTipeSurat(item.letterType?.code),
    tanggalSurat: item.createdAt,
    status: item.status,
    displayStatus: getDisplayStatusForRole(item.status, user.role, item.currentActiveRole),
    actions: getActionsForItem(user.role, item.status),
  }));

  return {
    columns: getColumnsForRole(user.role),
    items: mappedItems,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    statistics: {
      total,
      pending: items.filter((i) => i.status !== LetterStatus.COMPLETED).length,
      completed: items.filter((i) => i.status === LetterStatus.COMPLETED).length,
      waiting,
    },
  };
}

/**
 * Dashboard untuk Lingkup Fakultas (Admin Fakultas, Pejabat, Supervisor, Staf)
 */
async function getDashboardFakultas(
  user: DashboardUser,
  filters: DashboardFilters
): Promise<DashboardResult> {
  const page = parseInt(filters.page || '1', 10);
  const limit = parseInt(filters.limit || '20', 10);
  const offset = (page - 1) * limit;
  const type = filters.type || 'masuk';

  const where: any = {};

  // Check if user is a pejabat/supervisor/staf (not Admin Fakultas)
  const isPejabatOrBelow = [
    ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2,
    ROLES.MANAJER_TU, ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA,
    ROLES.STAF_AKADEMIK, ROLES.STAF_SUMBER_DAYA
  ].includes(user.role as any);

  if (type === 'masuk') {
    if (user.role === ROLES.ADMIN_FAKULTAS) {
      // Admin Fakultas sees incoming letters (SURAT_PENGANTAR_SIGNED) or received letters
      where.status = {
        in: [
          LetterStatus.SURAT_PENGANTAR_SIGNED,
          LetterStatus.FAKULTAS_RECEIVED,
        ],
      };
      where.currentActiveRole = ROLES.ADMIN_FAKULTAS;
    } else if (isPejabatOrBelow) {
      // Pejabat/Supervisor/Staf ONLY see letters assigned to them
      // They should NOT see letters that are still with Admin Fakultas
      where.status = {
        in: [
          LetterStatus.FAKULTAS_DISPOSITION,
          LetterStatus.FAKULTAS_VERIFICATION,
          LetterStatus.FAKULTAS_SIGNING,
          LetterStatus.FAKULTAS_DRAFTING,
        ],
      };
      // CRITICAL: Filter by currentActiveRole to prevent "leaking" letters
      where.currentActiveRole = user.role;
    }
  } else {
    // Surat Keluar = surat hasil (ST/SK)
    where.status = {
      in: [
        LetterStatus.FAKULTAS_DRAFTING,
        LetterStatus.FAKULTAS_VERIFICATION,
        LetterStatus.FAKULTAS_SIGNING,
        LetterStatus.UPA_NUMBERING,
        LetterStatus.UPA_STAMPING,
        LetterStatus.UPA_FINALIZING,
        LetterStatus.COMPLETED,
      ],
    };
    
    // For keluar tab, still filter by role for pejabat
    if (isPejabatOrBelow) {
      where.currentActiveRole = user.role;
    }
  }

  if (filters.status) {
    where.status = filters.status as LetterStatus;
  }

  if (filters.search) {
    where.OR = [
      { documents: { some: { perihal: { contains: filters.search, mode: 'insensitive' } } } },
      { createdBy: { name: { contains: filters.search, mode: 'insensitive' } } },
    ];
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const [items, total, masukCount, keluarCount] = await Promise.all([
    db.letterInstance.findMany({
      where,
      include: {
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
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
    db.letterInstance.count({ where }),
    db.letterInstance.count({
      where: {
        status: {
          in: [
            LetterStatus.SURAT_PENGANTAR_SIGNED,
            LetterStatus.FAKULTAS_RECEIVED,
            LetterStatus.FAKULTAS_DISPOSITION,
            LetterStatus.FAKULTAS_VERIFICATION,
            LetterStatus.FAKULTAS_SIGNING,
          ],
        },
      },
    }),
    db.letterInstance.count({
      where: {
        status: {
          in: [
            LetterStatus.FAKULTAS_DRAFTING,
            LetterStatus.UPA_NUMBERING,
            LetterStatus.UPA_STAMPING,
            LetterStatus.UPA_FINALIZING,
            LetterStatus.COMPLETED,
          ],
        },
      },
    }),
  ]);

  const waiting = items.filter((item) => {
    const displayStatus = getDisplayStatusForRole(item.status, user.role, item.currentActiveRole);
    return displayStatus.includes('MENUNGGU');
  }).length;

  const mappedItems: DashboardItem[] = items.map((item) => {
    const pengantarDoc = item.documents.find(d => d.type === 'SURAT_PENGANTAR');
    const hasilDoc = item.documents.find(d => d.type === 'SURAT_KEPUTUSAN' || d.type === 'SURAT_TUGAS');
    const doc = type === 'masuk' ? pengantarDoc : (hasilDoc || pengantarDoc);

    return {
      id: item.id,
      namaPengaju: item.createdBy?.name || '-',
      judulSurat: doc?.perihal || (item.submissionValues as any)?.judulAcara || '-',
      tipeSurat: getTipeSurat(item.letterType?.code),
      jenisSurat: item.letterType?.category || '-',
      tanggalSurat: item.createdAt,
      status: item.status,
      displayStatus: getDisplayStatusForRole(item.status, user.role, item.currentActiveRole),
      actions: getActionsForItem(user.role, item.status),
    };
  });

  return {
    columns: getColumnsForRole(user.role, type),
    items: mappedItems,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    statistics: {
      total,
      pending: items.filter((i) => i.status !== LetterStatus.COMPLETED).length,
      completed: items.filter((i) => i.status === LetterStatus.COMPLETED).length,
      waiting,
    },
    tabs: [
      { key: 'masuk', label: 'Surat Masuk', count: masukCount },
      { key: 'keluar', label: 'Surat Keluar', count: keluarCount },
    ],
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
  const limit = parseInt(filters.limit || '20', 10);
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
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }

  const [items, total, penomoran, stempel, finalisasi, completed] = await Promise.all([
    db.letterInstance.findMany({
      where,
      include: {
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
      skip: offset,
      take: limit,
    }),
    db.letterInstance.count({ where }),
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

  const mappedItems: DashboardItem[] = items.map((item) => {
    const hasilDoc = item.documents.find(d => d.type === 'SURAT_KEPUTUSAN' || d.type === 'SURAT_TUGAS');

    return {
      id: item.id,
      judulSurat: hasilDoc?.perihal || (item.submissionValues as any)?.judulAcara || '-',
      nomorSurat: hasilDoc?.nomorSurat || '-',
      tipeSurat: getTipeSurat(item.letterType?.code),
      jenisSurat: item.letterType?.category || '-',
      tanggalSurat: item.createdAt,
      status: item.status,
      displayStatus: getDisplayStatusForRole(item.status, user.role, item.currentActiveRole),
      actions: getActionsForItem(user.role, item.status),
    };
  });

  return {
    columns: getColumnsForRole(user.role),
    items: mappedItems,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
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
        mahasiswa: { select: { departemenId: true, programStudiId: true } },
        pegawai: { select: { departemenId: true } },
      },
    });

    const dashboardUser: DashboardUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: primaryRole,
      departemenId: userDetails?.mahasiswa?.departemenId || userDetails?.pegawai?.departemenId,
      programStudiId: userDetails?.mahasiswa?.programStudiId,
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
