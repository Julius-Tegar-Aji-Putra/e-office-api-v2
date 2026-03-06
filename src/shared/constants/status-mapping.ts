/**
 * Status Display Mapping - Sesuai Prompting.md Section 5
 * Mapping status database ke tampilan dashboard per role
 */

import { LetterStatus } from '../../generated/prisma/enums';
import { ROLES, type RoleName } from './roles';

/**
 * Display Status yang ditampilkan ke user
 */
export const DISPLAY_STATUS = {
  DIPROSES: 'DIPROSES',
  SELESAI: 'SELESAI',
  DITOLAK: 'DITOLAK',
  DIKEMBALIKAN: 'DIKEMBALIKAN',
  DIKEMBALIKAN_KE_PENGAJU: 'DIKEMBALIKAN KE PENGAJU',
  MENUNGGU_ANDA: 'MENUNGGU ANDA',
  MENUNGGU_DIVERIFIKASI: 'MENUNGGU DIVERIFIKASI',
  MENUNGGU_DITANDATANGANI: 'MENUNGGU DITANDATANGANI',
  SURAT_DIBUAT: 'SURAT DIBUAT',
} as const;

export type DisplayStatus = typeof DISPLAY_STATUS[keyof typeof DISPLAY_STATUS];

/**
 * Status mapping berdasarkan role login
 * Sesuai dengan Kamus Definisi Status di Prompting.md
 */
export function getDisplayStatus(
  dbStatus: LetterStatus, 
  viewerRole: RoleName, 
  currentActiveRole: string | null,
  isViewer: boolean = false
): DisplayStatus {
  const isMyTurn = currentActiveRole === viewerRole;

  // PENGAJU (Mahasiswa/Dosen)
  if (viewerRole === ROLES.MAHASISWA || viewerRole === ROLES.DOSEN) {
    switch (dbStatus) {
      case LetterStatus.COMPLETED:
        return DISPLAY_STATUS.SELESAI;
      case LetterStatus.REJECTED:
        return DISPLAY_STATUS.DITOLAK;
      case LetterStatus.CANCELLED:
        return DISPLAY_STATUS.DIKEMBALIKAN_KE_PENGAJU;
      default:
        return DISPLAY_STATUS.DIPROSES;
    }
  }

  // KETUA PRODI
  if (viewerRole === ROLES.KAPRODI) {
    if (dbStatus === LetterStatus.SUBMITTED || dbStatus === LetterStatus.KAPRODI_REVIEW) {
      return DISPLAY_STATUS.MENUNGGU_DIVERIFIKASI;
    }
    if (dbStatus === LetterStatus.SURAT_PENGANTAR_REVIEW && isMyTurn) {
      return DISPLAY_STATUS.MENUNGGU_DITANDATANGANI;
    }
    if (dbStatus === LetterStatus.SURAT_DIBUAT) {
      return DISPLAY_STATUS.SURAT_DIBUAT;
    }
    if (dbStatus === LetterStatus.COMPLETED) {
      return DISPLAY_STATUS.SELESAI;
    }
    if (dbStatus === LetterStatus.REJECTED) {
      return DISPLAY_STATUS.DITOLAK;
    }
    if (dbStatus === LetterStatus.CANCELLED) {
      return DISPLAY_STATUS.DIKEMBALIKAN_KE_PENGAJU;
    }
    return DISPLAY_STATUS.DIPROSES;
  }

  // ADMIN PRODI
  if (viewerRole === ROLES.ADMIN_PRODI) {
    if (dbStatus === LetterStatus.SURAT_PENGANTAR_DRAFT) {
      return DISPLAY_STATUS.MENUNGGU_ANDA;
    }
    if (dbStatus === LetterStatus.SURAT_DIBUAT) {
      return DISPLAY_STATUS.SURAT_DIBUAT;
    }
    if (dbStatus === LetterStatus.COMPLETED) {
      return DISPLAY_STATUS.SELESAI;
    }
    if (dbStatus === LetterStatus.CANCELLED) {
      return DISPLAY_STATUS.DIKEMBALIKAN_KE_PENGAJU;
    }
    return DISPLAY_STATUS.DIPROSES;
  }

  // KETUA DEPARTEMEN
  if (viewerRole === ROLES.KADEP) {
    // KADEP approval untuk prodi tanpa Kaprodi
    if (dbStatus === LetterStatus.SUBMITTED && isMyTurn) {
      return DISPLAY_STATUS.MENUNGGU_DIVERIFIKASI;
    }
    // KADEP signing surat pengantar
    if (dbStatus === LetterStatus.SURAT_PENGANTAR_REVIEW && isMyTurn) {
      return DISPLAY_STATUS.MENUNGGU_DITANDATANGANI;
    }
    if (dbStatus === LetterStatus.SURAT_DIBUAT) {
      return DISPLAY_STATUS.SURAT_DIBUAT;
    }
    if (dbStatus === LetterStatus.COMPLETED) {
      return DISPLAY_STATUS.SELESAI;
    }
    if (dbStatus === LetterStatus.REJECTED) {
      return DISPLAY_STATUS.DITOLAK;
    }
    if (dbStatus === LetterStatus.CANCELLED) {
      return DISPLAY_STATUS.DIKEMBALIKAN_KE_PENGAJU;
    }
    return DISPLAY_STATUS.DIPROSES;
  }

  // ADMIN FAKULTAS
  if (viewerRole === ROLES.ADMIN_FAKULTAS) {
    if (dbStatus === LetterStatus.SURAT_PENGANTAR_SIGNED || dbStatus === LetterStatus.FAKULTAS_RECEIVED) {
      return DISPLAY_STATUS.MENUNGGU_ANDA;
    }
    if (dbStatus === LetterStatus.COMPLETED) {
      return DISPLAY_STATUS.SELESAI;
    }
    if (dbStatus === LetterStatus.CANCELLED) {
      return DISPLAY_STATUS.DIKEMBALIKAN_KE_PENGAJU;
    }
    return DISPLAY_STATUS.DIPROSES;
  }

  // PEJABAT (Dekan, Wadek, Manajer TU)
  if ([ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2, ROLES.MANAJER_TU].includes(viewerRole as any)) {
    if ((dbStatus === LetterStatus.FAKULTAS_DISPOSITION || 
         dbStatus === LetterStatus.FAKULTAS_VERIFICATION ||
         dbStatus === LetterStatus.FAKULTAS_SIGNING) && isMyTurn) {
      return DISPLAY_STATUS.MENUNGGU_ANDA;
    }
    if (dbStatus === LetterStatus.COMPLETED) {
      return DISPLAY_STATUS.SELESAI;
    }
    if (dbStatus === LetterStatus.CANCELLED) {
      return DISPLAY_STATUS.DIKEMBALIKAN;
    }
    return DISPLAY_STATUS.DIPROSES;
  }

  // SUPERVISOR
  if ([ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA].includes(viewerRole as any)) {
    if ((dbStatus === LetterStatus.FAKULTAS_DISPOSITION ||
         dbStatus === LetterStatus.FAKULTAS_VERIFICATION ||
         dbStatus === LetterStatus.SURAT_DIBUAT ||
         dbStatus === LetterStatus.FAKULTAS_DRAFTING) && isMyTurn) {
      return DISPLAY_STATUS.MENUNGGU_ANDA;
    }
    if (dbStatus === LetterStatus.COMPLETED) {
      return DISPLAY_STATUS.SELESAI;
    }
    if (dbStatus === LetterStatus.CANCELLED) {
      return DISPLAY_STATUS.DIKEMBALIKAN;
    }
    return DISPLAY_STATUS.DIPROSES;
  }

  // STAF
  if ([ROLES.STAF_AKADEMIK, ROLES.STAF_SUMBER_DAYA].includes(viewerRole as any)) {
    if ((dbStatus === LetterStatus.SURAT_DIBUAT || dbStatus === LetterStatus.FAKULTAS_DRAFTING) && isMyTurn) {
      return DISPLAY_STATUS.MENUNGGU_ANDA;
    }
    if (dbStatus === LetterStatus.COMPLETED) {
      return DISPLAY_STATUS.SELESAI;
    }
    return DISPLAY_STATUS.DIPROSES;
  }

  // UPA
  if (viewerRole === ROLES.UPA) {
    if ((dbStatus === LetterStatus.UPA_NUMBERING ||
         dbStatus === LetterStatus.UPA_STAMPING ||
         dbStatus === LetterStatus.UPA_FINALIZING) && isMyTurn) {
      return DISPLAY_STATUS.MENUNGGU_ANDA;
    }
    if (dbStatus === LetterStatus.COMPLETED) {
      return DISPLAY_STATUS.SELESAI;
    }
    return DISPLAY_STATUS.DIPROSES;
  }

  // Default
  return DISPLAY_STATUS.DIPROSES;
}

/**
 * Get color for display status (for frontend)
 */
export function getStatusColor(status: DisplayStatus): string {
  switch (status) {
    case DISPLAY_STATUS.SELESAI:
      return 'green';
    case DISPLAY_STATUS.DITOLAK:
      return 'red';
    case DISPLAY_STATUS.DIKEMBALIKAN:
    case DISPLAY_STATUS.DIKEMBALIKAN_KE_PENGAJU:
      return 'orange';
    case DISPLAY_STATUS.MENUNGGU_ANDA:
    case DISPLAY_STATUS.MENUNGGU_DIVERIFIKASI:
    case DISPLAY_STATUS.MENUNGGU_DITANDATANGANI:
      return 'blue';
    case DISPLAY_STATUS.SURAT_DIBUAT:
      return 'blue';
    case DISPLAY_STATUS.DIPROSES:
    default:
      return 'gray';
  }
}
