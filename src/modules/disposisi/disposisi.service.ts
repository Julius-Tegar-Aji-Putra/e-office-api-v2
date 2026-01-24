/**
 * Disposisi Service
 * Business logic untuk modul disposisi fakultas
 */

import { disposisiRepository, DisposisiListParams, DisposisiInput, ReturnInput, CompleteInput } from './disposisi.repository';
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

class DisposisiService {
  /**
   * Get incoming letters for Admin Fakultas
   */
  async getIncomingLetters(params: DisposisiListParams): Promise<ServiceResult> {
    try {
      const result = await disposisiRepository.getIncomingLettersForAdmin(params);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  /**
   * Get letters in disposition queue for pejabat
   */
  async getDispositionQueue(userRole: string, params: DisposisiListParams): Promise<ServiceResult> {
    try {
      const result = await disposisiRepository.getLettersForDisposition(userRole, params);
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
      const letter = await disposisiRepository.getLetterById(letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      // Get available targets for disposition
      const category = letter.letterType.category as LetterCategory;
      const currentRole = userRoles.find(r => r === letter.currentActiveRole);
      
      const dispositionTargets = currentRole
        ? this.getAvailableDispositionTargets(currentRole, category)
        : [];

      const returnTargets = currentRole
        ? this.getAvailableReturnTargets(currentRole, category)
        : [];

      const permissions = this.getActionPermissions(letter, userRoles);

      return {
        success: true,
        data: {
          letter,
          dispositionTargets,
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
      const letter = await disposisiRepository.getLetterById(letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      if (letter.status !== LetterStatus.SURAT_PENGANTAR_SIGNED) {
        return { success: false, error: 'Surat tidak dalam status yang dapat dikategorikan', code: 400 };
      }

      const result = await disposisiRepository.receiveAndCategorize(letterId, category, userId, userRole);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  /**
   * Create disposition to next role
   */
  async createDisposition(
    input: DisposisiInput,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      const letter = await disposisiRepository.getLetterById(input.letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      // Validate current role can disposition
      if (letter.currentActiveRole !== userRole) {
        return { success: false, error: 'Bukan giliran Anda untuk disposisi', code: 403 };
      }

      // Validate target role is lower in hierarchy
      if (!canDispositionTo(userRole, input.targetRole)) {
        return { success: false, error: 'Tidak dapat disposisi ke role yang lebih tinggi', code: 400 };
      }

      // Check if target is staff -> change status to DRAFTING
      if ((STAF_ROLES as readonly string[]).includes(input.targetRole)) {
        const result = await disposisiRepository.dispositionToStaff(
          input.letterId,
          input.targetRole,
          userId,
          userRole,
          input.notes
        );
        return { success: true, data: result };
      }

      const fromStatus = letter.status as LetterStatus;
      const result = await disposisiRepository.createDisposition(input, userId, userRole, fromStatus);
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
      const letter = await disposisiRepository.getLetterById(input.letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      if (letter.currentActiveRole !== userRole) {
        return { success: false, error: 'Bukan giliran Anda untuk menyelesaikan surat ini', code: 403 };
      }

      if (!input.notes || input.notes.trim() === '') {
        return { success: false, error: 'Catatan wajib diisi untuk menyelesaikan surat', code: 400 };
      }

      const result = await disposisiRepository.markAsComplete(input, userId, userRole);
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
      const letter = await disposisiRepository.getLetterById(input.letterId);

      if (!letter) {
        return { success: false, error: 'Surat tidak ditemukan', code: 404 };
      }

      if (letter.currentActiveRole !== userRole) {
        return { success: false, error: 'Bukan giliran Anda', code: 403 };
      }

      if (!input.reason || input.reason.trim() === '') {
        return { success: false, error: 'Alasan pengembalian wajib diisi', code: 400 };
      }

      const result = await disposisiRepository.returnLetter(input, userId, userRole);
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
      const result = await disposisiRepository.getUsersByRole(role);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 500 };
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

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

  private getAvailableReturnTargets(
    currentRole: string,
    _category: LetterCategory
  ): string[] {
    // Can return to Admin Fakultas or previous disposer
    const targets: string[] = [ROLES.ADMIN_FAKULTAS];

    // For non-admin roles, can also return to Admin Prodi
    if (currentRole !== ROLES.ADMIN_FAKULTAS) {
      targets.push(ROLES.ADMIN_PRODI);
    }

    return targets;
  }

  private getActionPermissions(
    letter: Awaited<ReturnType<typeof disposisiRepository.getLetterById>>,
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

      // Can disposition when status is RECEIVED or DISPOSITION and it's their turn
      canDisposition: isCurrentRole && (
        letter.status === LetterStatus.FAKULTAS_RECEIVED ||
        letter.status === LetterStatus.FAKULTAS_DISPOSITION
      ),

      // Pejabat can mark as complete during disposition
      canComplete: isPejabat && 
        letter.status === LetterStatus.FAKULTAS_DISPOSITION && isCurrentRole,

      // Can return during disposition
      canReturn: isCurrentRole && 
        letter.status === LetterStatus.FAKULTAS_DISPOSITION
    };
  }
}

export const disposisiService = new DisposisiService();
