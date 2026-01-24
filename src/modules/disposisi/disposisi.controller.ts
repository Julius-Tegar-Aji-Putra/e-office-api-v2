/**
 * Disposisi Controller
 * HTTP handler untuk modul disposisi fakultas
 */

import { disposisiService } from './disposisi.service';
import { DisposisiListParams } from './disposisi.repository';
import { successResponse, errorResponse } from '../../shared/utils/response';
import { LetterCategory } from '../../generated/prisma/client';

// ============================================================================
// CONTROLLER CLASS
// ============================================================================

class DisposisiController {
  /**
   * GET /disposisi/incoming
   * Get incoming letters for Admin Fakultas
   */
  async getIncomingLetters(params: DisposisiListParams) {
    const result = await disposisiService.getIncomingLetters(params);
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Berhasil mengambil surat masuk', result.data);
  }

  /**
   * GET /disposisi/queue
   * Get disposition queue for pejabat
   */
  async getDispositionQueue(userRole: string, params: DisposisiListParams) {
    const result = await disposisiService.getDispositionQueue(userRole, params);
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Berhasil mengambil antrian disposisi', result.data);
  }

  /**
   * GET /disposisi/:id
   * Get letter detail with disposition context
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    const result = await disposisiService.getLetterDetail(letterId, userId, userRoles);
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Berhasil mengambil detail surat', result.data);
  }

  /**
   * POST /disposisi/:id/categorize
   * Admin Fakultas categorizes incoming letter
   */
  async categorizeAndReceive(
    letterId: string,
    body: { category: LetterCategory },
    userId: string,
    userRole: string
  ) {
    const result = await disposisiService.receiveAndCategorize(
      letterId,
      body.category,
      userId,
      userRole
    );
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Surat berhasil dikategorikan', result.data);
  }

  /**
   * POST /disposisi/:id/forward
   * Forward/disposition letter to next role
   */
  async forwardLetter(
    letterId: string,
    body: { targetRole: string; notes?: string },
    userId: string,
    userRole: string
  ) {
    const result = await disposisiService.createDisposition(
      { letterId, targetRole: body.targetRole, notes: body.notes },
      userId,
      userRole
    );
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Surat berhasil didisposisikan', result.data);
  }

  /**
   * POST /disposisi/:id/complete
   * Mark letter as complete at current level
   */
  async markComplete(
    letterId: string,
    body: { notes: string },
    userId: string,
    userRole: string
  ) {
    const result = await disposisiService.markAsComplete(
      { letterId, notes: body.notes },
      userId,
      userRole
    );
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Surat selesai diproses', result.data);
  }

  /**
   * POST /disposisi/:id/return
   * Return letter to previous role
   */
  async returnLetter(
    letterId: string,
    body: { reason: string; targetRole: string },
    userId: string,
    userRole: string
  ) {
    const result = await disposisiService.returnLetter(
      { letterId, reason: body.reason, targetRole: body.targetRole },
      userId,
      userRole
    );
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Surat dikembalikan', result.data);
  }

  /**
   * GET /disposisi/users/:role
   * Get users by role for dropdown
   */
  async getUsersByRole(role: string) {
    const result = await disposisiService.getUsersForDisposition(role);
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Berhasil mengambil daftar user', result.data);
  }
}

export const disposisiController = new DisposisiController();
