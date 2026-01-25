/**
 * Faculty Disposition Controller
 * HTTP handler untuk modul disposisi fakultas
 */

import { facultyDispositionService } from './faculty-disposition.service';
import { DispositionListParams } from './faculty-disposition.repository';
import { successResponse, errorResponse } from '../../shared/utils/response';
import { LetterCategory } from '../../generated/prisma/client';

// ============================================================================
// CONTROLLER CLASS
// ============================================================================

class FacultyDispositionController {
  /**
   * GET /faculty-disposition/incoming
   * Get incoming letters for Admin Fakultas
   */
  async getIncomingLetters(params: DispositionListParams) {
    const result = await facultyDispositionService.getIncomingLetters(params);
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Berhasil mengambil surat masuk', result.data);
  }

  /**
   * GET /faculty-disposition/queue
   * Get disposition queue for pejabat
   */
  async getDispositionQueue(userRole: string, params: DispositionListParams) {
    const result = await facultyDispositionService.getDispositionQueue(userRole, params);
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Berhasil mengambil antrian disposisi', result.data);
  }

  /**
   * GET /faculty-disposition/:id
   * Get letter detail with disposition context
   */
  async getLetterDetail(letterId: string, userId: string, userRoles: string[]) {
    const result = await facultyDispositionService.getLetterDetail(letterId, userId, userRoles);
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Berhasil mengambil detail surat', result.data);
  }

  /**
   * POST /faculty-disposition/:id/categorize
   * Admin Fakultas categorizes incoming letter
   */
  async categorizeAndReceive(
    letterId: string,
    body: { category: LetterCategory },
    userId: string,
    userRole: string
  ) {
    const result = await facultyDispositionService.receiveAndCategorize(
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
   * POST /faculty-disposition/:id/forward
   * Forward/disposition letter to next role
   */
  async forwardLetter(
    letterId: string,
    body: { targetRole: string; notes?: string },
    userId: string,
    userRole: string
  ) {
    const result = await facultyDispositionService.createDisposition(
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
   * POST /faculty-disposition/:id/complete
   * Mark letter as complete at current level
   */
  async markComplete(
    letterId: string,
    body: { notes: string },
    userId: string,
    userRole: string
  ) {
    const result = await facultyDispositionService.markAsComplete(
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
   * POST /faculty-disposition/:id/return
   * Return letter to previous role
   * CATATAN WAJIB DIISI
   */
  async returnLetter(
    letterId: string,
    body: { reason: string; targetRole: string },
    userId: string,
    userRole: string
  ) {
    const result = await facultyDispositionService.returnLetter(
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
   * GET /faculty-disposition/users/:role
   * Get users by role for dropdown
   */
  async getUsersByRole(role: string) {
    const result = await facultyDispositionService.getUsersForDisposition(role);
    if (!result.success) {
      return errorResponse(result.error || 'Unknown error', result.code || 500);
    }
    return successResponse('Berhasil mengambil daftar user', result.data);
  }
}

export const facultyDispositionController = new FacultyDispositionController();
