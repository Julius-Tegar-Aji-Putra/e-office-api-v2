/**
 * Faculty Disposition Service
 * Business logic untuk modul disposisi fakultas
 * 
 * PERBAIKAN LOGIC RETURN TARGETS:
 * - Ambil dari history disposisi (siapa yang pernah handle)
 * - Default: ADMIN_PRODI (dead end jika dipilih)
 * - ADMIN_FAKULTAS selalu tersedia (bisa lanjut)
 */

import { facultyDispositionRepository, DispositionListParams, DispositionInput, ReturnInput, CompleteInput } from './faculty-disposition.repository';
import { LetterStatus, LetterCategory } from '../../generated/prisma/client';
import {
  ROLES,
  ROLE_HIERARCHY,
  getDisposisiTargets,
  canDispositionTo,
  STAF_ROLES
} from '../../shared/constants/roles';

// ============================================================================
// TYPES
// ============================================================================

export interface ServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class FacultyDispositionService {
  /**
   * Get incoming letters for Admin Fakultas
   */
  async getIncomingLetters(params: DispositionListParams): Promise<ServiceResult> {
    try {
      const result = await facultyDispositionRepository.getIncomingLettersForAdmin(params);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  /**
   * Get letters in disposition queue for pejabat
   */
  async getDispositionQueue(userRole: string, params: DispositionListParams): Promise<ServiceResult> {
    try {
      const result = await facultyDispositionRepository.getLettersForDisposition(userRole, params);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  /**
   * Get letter detail with disposition context
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]): Promise<ServiceResult> {
    try {
      const letter = await facultyDispositionRepository.getLetterById(letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      // Get available targets for disposition
      const category = letter.letterType.category as LetterCategory;
      const currentRole = userRoles.find(r => r === letter.currentActiveRole);
      const isAdminFakultas = userRoles.includes(ROLES.ADMIN_FAKULTAS);

      // Admin Fakultas dapat meneruskan ke siapapun (forward)
      // Pejabat hanya bisa disposisi ke level bawah
      let dispositionTargets: string[] = [];
      let forwardTargets: string[] = [];

      if (currentRole) {
        if (isAdminFakultas && letter.status === LetterStatus.FAKULTAS_RECEIVED) {
          // Admin Fakultas - Meneruskan (bebas pilih)
          forwardTargets = this.getAvailableForwardTargets();
        } else if (letter.status === LetterStatus.FAKULTAS_DISPOSITION) {
          // Pejabat - Disposisi (terikat level)
          dispositionTargets = this.getAvailableDispositionTargets(currentRole, category);
        }
      }

      // PERBAIKAN: Return targets berdasarkan history
      const returnTargets = currentRole
        ? await this.getAvailableReturnTargets(letterId, currentRole)
        : [];

      const permissions = this.getActionPermissions(letter, userRoles);

      return {
        success: true,
        data: {
          letter,
          forwardTargets,      // Untuk Admin Fakultas
          dispositionTargets,  // Untuk Pejabat
          returnTargets,
          permissions
        }
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  /**
   * Admin Fakultas receives and categorizes letter
   */
  async receiveAndCategorize(
    letterId: string,
    category: LetterCategory,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      const letter = await facultyDispositionRepository.getLetterById(letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      if (letter.status !== LetterStatus.SURAT_PENGANTAR_SIGNED) {
        return { success: false, error: 'Surat tidak dalam status yang dapat dikategorikan', code: 400 };
      }

      const result = await facultyDispositionRepository.receiveAndCategorize(letterId, category, userId, userRole);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  /**
   * Forward letter (Admin Fakultas) - BEBAS pilih target
   * Ini berbeda dengan disposisi pejabat yang terikat level
   */
  async forwardLetter(
    input: DispositionInput,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      const letter = await facultyDispositionRepository.getLetterById(input.letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      // Hanya Admin Fakultas yang bisa forward
      if (userRole !== ROLES.ADMIN_FAKULTAS) {
        return { success: false, error: 'Hanya Admin Fakultas yang dapat meneruskan surat', code: 403 };
      }

      // Validate current role
      if (letter.currentActiveRole !== userRole) {
        return { success: false, error: 'Bukan giliran Anda untuk meneruskan surat', code: 403 };
      }

      // Validasi status surat harus FAKULTAS_RECEIVED
      if (letter.status !== LetterStatus.FAKULTAS_RECEIVED) {
        return { success: false, error: 'Surat tidak dalam status yang dapat diteruskan', code: 400 };
      }

      // Admin Fakultas BEBAS pilih target (DEKAN, WADEK, MANAJER_TU, dsb)
      // Tidak perlu cek hierarchy level
      const validTargets: string[] = [
        ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2, ROLES.MANAJER_TU,
        ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA,
        ROLES.STAF_AKADEMIK, ROLES.STAF_SUMBER_DAYA
      ];

      if (!validTargets.includes(input.targetRole)) {
        return { success: false, error: 'Target penerusan tidak valid', code: 400 };
      }

      // Check if target is staff -> change status to DRAFTING
      if ((STAF_ROLES as readonly string[]).includes(input.targetRole)) {
        const result = await facultyDispositionRepository.dispositionToStaff(
          input.letterId,
          input.targetRole,
          userId,
          userRole,
          input.notes
        );
        return { success: true, data: result };
      }

      // Forward ke pejabat - status jadi FAKULTAS_DISPOSITION
      const fromStatus = letter.status as LetterStatus;
      const result = await facultyDispositionRepository.createDisposition(input, userId, userRole, fromStatus);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  /**
   * Create disposition to next role (Pejabat only)
   * Pejabat HANYA bisa disposisi ke role yang lebih rendah (terikat hierarchy)
   */
  async createDisposition(
    input: DispositionInput,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      const letter = await facultyDispositionRepository.getLetterById(input.letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      // Validate current role can disposition
      if (letter.currentActiveRole !== userRole) {
        return { success: false, error: 'Bukan giliran Anda untuk disposisi', code: 403 };
      }

      // Pejabat: Validate target role is lower in hierarchy
      if (!canDispositionTo(userRole, input.targetRole)) {
        return { success: false, error: 'Tidak dapat disposisi ke role yang lebih tinggi atau setara', code: 400 };
      }

      // Check if target is staff -> change status to DRAFTING
      if ((STAF_ROLES as readonly string[]).includes(input.targetRole)) {
        const result = await facultyDispositionRepository.dispositionToStaff(
          input.letterId,
          input.targetRole,
          userId,
          userRole,
          input.notes
        );
        return { success: true, data: result };
      }

      const fromStatus = letter.status as LetterStatus;
      const result = await facultyDispositionRepository.createDisposition(input, userId, userRole, fromStatus);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  /**
   * Mark letter as complete (selesai di level pejabat)
   */
  async markAsComplete(input: CompleteInput, userId: string, userRole: string): Promise<ServiceResult> {
    try {
      const letter = await facultyDispositionRepository.getLetterById(input.letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      if (letter.currentActiveRole !== userRole) {
        return { success: false, error: 'Bukan giliran Anda untuk menyelesaikan surat ini', code: 403 };
      }

      if (!input.notes || input.notes.trim() === '') {
        return { success: false, error: 'Catatan wajib diisi untuk menyelesaikan surat', code: 400 };
      }

      const result = await facultyDispositionRepository.markAsComplete(input, userId, userRole);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  /**
   * Return letter to previous role
   */
  async returnLetter(input: ReturnInput, userId: string, userRole: string): Promise<ServiceResult> {
    try {
      const letter = await facultyDispositionRepository.getLetterById(input.letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      if (letter.currentActiveRole !== userRole) {
        return { success: false, error: 'Bukan giliran Anda', code: 403 };
      }

      // VALIDASI: Alasan pengembalian WAJIB
      if (!input.reason || input.reason.trim() === '') {
        return { success: false, error: 'Alasan pengembalian wajib diisi', code: 400 };
      }

      // Validasi target role
      const validTargets = await this.getAvailableReturnTargets(input.letterId, userRole);
      if (!validTargets.includes(input.targetRole)) {
        return { success: false, error: 'Target pengembalian tidak valid', code: 400 };
      }

      const result = await facultyDispositionRepository.returnLetter(input, userId, userRole);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  /**
   * Get users by role for disposition dropdown
   */
  async getUsersForDisposition(role: string): Promise<ServiceResult> {
    try {
      const result = await facultyDispositionRepository.getUsersByRole(role);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Get available forward targets for Admin Fakultas
   * Admin Fakultas dapat meneruskan ke SIAPAPUN (tidak terikat hierarchy)
   */
  private getAvailableForwardTargets(): string[] {
    return [
      ROLES.DEKAN,
      ROLES.WADEK_1,
      ROLES.WADEK_2,
      ROLES.MANAJER_TU,
      ROLES.SUPERVISOR_AKADEMIK,
      ROLES.SUPERVISOR_SUMBER_DAYA,
      ROLES.STAF_AKADEMIK,
      ROLES.STAF_SUMBER_DAYA
    ];
  }

  /**
   * Get available disposition targets for Pejabat
   * Pejabat HANYA bisa disposisi ke role yang levelnya lebih RENDAH
   */
  private getAvailableDispositionTargets(
    currentRole: string,
    category: LetterCategory
  ): string[] {
    const allTargets = getDisposisiTargets(category as 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM');
    const currentLevel = ROLE_HIERARCHY[currentRole] ?? 0;

    // Filter to roles lower than current
    return allTargets.filter(role => {
      const roleLevel = ROLE_HIERARCHY[role] ?? 0;
      return roleLevel < currentLevel;
    }) as string[];
  }

  /**
   * PERBAIKAN: Get available return targets berdasarkan history disposisi
   * 
   * Logic:
   * 1. Query history siapa saja yang pernah handle surat ini
   * 2. Admin Prodi SELALU tersedia (default, tapi jadi dead end)
   * 3. Admin Fakultas tersedia jika surat pernah lewat sana
   * 4. Pejabat lain tersedia jika ada di history dan levelnya lebih tinggi
   */
  private async getAvailableReturnTargets(
    letterId: string,
    currentRole: string
  ): Promise<string[]> {
    // ADMIN_PRODI selalu jadi default target (akan menjadi DEAD END)
    const targets: string[] = [ROLES.ADMIN_PRODI];

    // Get history actors dari repository
    const historyActors = await facultyDispositionRepository.getDispositionHistoryActors(letterId);

    // Admin Fakultas selalu tersedia untuk return (kecuali current role sudah Admin Fakultas)
    if (currentRole !== ROLES.ADMIN_FAKULTAS) {
      targets.push(ROLES.ADMIN_FAKULTAS);
    }

    // Tambahkan pejabat dari history yang levelnya lebih tinggi dari current
    const currentLevel = ROLE_HIERARCHY[currentRole] ?? 0;
    for (const actor of historyActors) {
      // Skip jika sudah ada di targets atau sama dengan current role
      if (targets.includes(actor) || actor === currentRole) continue;

      // Skip Admin Prodi dan Admin Fakultas (sudah ditangani di atas)
      if (actor === ROLES.ADMIN_PRODI || actor === ROLES.ADMIN_FAKULTAS) continue;

      // Hanya tambahkan jika level lebih tinggi (nilai ROLE_HIERARCHY lebih besar)
      const actorLevel = ROLE_HIERARCHY[actor] ?? 0;
      if (actorLevel > currentLevel) {
        targets.push(actor);
      }
    }

    return targets;
  }

  private getActionPermissions(
    letter: Awaited<ReturnType<typeof facultyDispositionRepository.getLetterById>>,
    userRoles: string[]
  ): Record<string, boolean> {
    if (!letter) {
      return {
        canCategorize: false,
        canDisposition: false,
        canComplete: false,
        canReturn: false
      };
    }

    const isCurrentRole = letter.currentActiveRole
      ? userRoles.includes(letter.currentActiveRole)
      : false;
    const isAdminFakultas = userRoles.includes(ROLES.ADMIN_FAKULTAS);
    const isPejabat = userRoles.some(r => 
      ([ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2, ROLES.MANAJER_TU,
       ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA] as string[]).includes(r)
    );

    return {
      // Admin Fakultas can categorize incoming letters
      canCategorize: isAdminFakultas && 
        letter.status === LetterStatus.SURAT_PENGANTAR_SIGNED && isCurrentRole,

      // Admin Fakultas can forward (meneruskan) - BEBAS target
      canForward: isAdminFakultas && 
        letter.status === LetterStatus.FAKULTAS_RECEIVED && isCurrentRole,

      // Pejabat can disposition - TERIKAT hierarchy (ke level bawah)
      canDisposition: isPejabat && 
        letter.status === LetterStatus.FAKULTAS_DISPOSITION && isCurrentRole,

      // Pejabat can mark as complete during disposition
      canComplete: isPejabat && 
        letter.status === LetterStatus.FAKULTAS_DISPOSITION && isCurrentRole,

      // Can return during disposition
      canReturn: isCurrentRole && 
        letter.status === LetterStatus.FAKULTAS_DISPOSITION
    };
  }
}

export const facultyDispositionService = new FacultyDispositionService();
