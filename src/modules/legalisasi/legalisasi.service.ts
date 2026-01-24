/**
 * Legalisasi Service
 * Business logic untuk modul UPA (penomoran, stempel, finalisasi)
 */

import { 
  legalisasiRepository, 
  LegalisasiListParams,
  AssignNumberInput,
  FinalizeInput
} from './legalisasi.repository';
import { LetterStatus, DocumentType } from '../../generated/prisma/client';
import { Elysia, t } from 'elysia';

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

class LegalisasiService {
  /**
   * Get queue for UPA staff
   */
  async getUPAQueue(
    params: LegalisasiListParams,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      // Check if user has UPA role
      if (userRole !== 'UPA' && userRole !== 'ADMIN') {
        return { 
          success: false, 
          error: 'Access denied. Only UPA staff can access this queue',
          code: 403 
        };
      }

      const result = await legalisasiRepository.getLettersForUPA(params);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Error getting UPA queue:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get UPA queue',
        code: 500
      };
    }
  }

  /**
   * Get letter detail for UPA
   */
  async getLetterDetail(
    letterId: string,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      const letter = await legalisasiRepository.getLetterById(letterId);
      
      if (!letter) {
        return { success: false, error: 'Letter not found', code: 404 };
      }

      return { success: true, data: letter };
    } catch (error) {
      console.error('Error getting letter detail:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get letter detail',
        code: 500
      };
    }
  }

  /**
   * Get recent nomor surat for reference
   */
  async getRecentNomorSurat(
    documentType: DocumentType,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      const recentNumbers = await legalisasiRepository.getRecentNomorSurat(documentType);

      return { success: true, data: recentNumbers };
    } catch (error) {
      console.error('Error getting recent nomor surat:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get recent nomor surat',
        code: 500
      };
    }
  }

  /**
   * Assign nomor surat to document
   */
  async assignNomorSurat(
    input: AssignNumberInput,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      // Check document exists
      const document = await legalisasiRepository.getDocumentById(input.documentId);
      if (!document) {
        return { success: false, error: 'Document not found', code: 404 };
      }

      // Check letter status
      if (document.letterInstance.status !== LetterStatus.UPA_NUMBERING) {
        return { 
          success: false, 
          error: `Cannot assign number. Current status: ${document.letterInstance.status}`,
          code: 400 
        };
      }

      // Check for duplicate nomor surat
      const isDuplicate = await legalisasiRepository.checkNomorSuratExists(
        input.nomorSurat,
        input.documentId
      );
      if (isDuplicate) {
        return { 
          success: false, 
          error: 'Nomor surat already exists. Please use a different number.',
          code: 409 
        };
      }

      const result = await legalisasiRepository.assignNomorSurat(input, userId, userRole);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('Error assigning nomor surat:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to assign nomor surat',
        code: 500
      };
    }
  }

  /**
   * Apply stamp to document
   */
  async applyStamp(
    documentId: string,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      const document = await legalisasiRepository.getDocumentById(documentId);
      if (!document) {
        return { success: false, error: 'Document not found', code: 404 };
      }

      if (document.letterInstance.status !== LetterStatus.UPA_STAMPING) {
        return { 
          success: false, 
          error: `Cannot stamp. Current status: ${document.letterInstance.status}`,
          code: 400 
        };
      }

      const result = await legalisasiRepository.applyStamp(documentId, userId, userRole);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('Error applying stamp:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to apply stamp',
        code: 500
      };
    }
  }

  /**
   * Finalize document
   */
  async finalizeDocument(
    input: FinalizeInput,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      const document = await legalisasiRepository.getDocumentById(input.documentId);
      if (!document) {
        return { success: false, error: 'Document not found', code: 404 };
      }

      if (document.letterInstance.status !== LetterStatus.UPA_FINALIZING) {
        return { 
          success: false, 
          error: `Cannot finalize. Current status: ${document.letterInstance.status}`,
          code: 400 
        };
      }

      const result = await legalisasiRepository.finalizeDocument(input, userId, userRole);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error('Error finalizing document:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to finalize document',
        code: 500
      };
    }
  }

  /**
   * Get tembusan recipients for distribution
   */
  async getTembusanRecipients(
    documentId: string,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      const recipients = await legalisasiRepository.getTembusanRecipients(documentId);

      return { success: true, data: recipients };
    } catch (error) {
      console.error('Error getting tembusan recipients:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tembusan recipients',
        code: 500
      };
    }
  }
}

export const legalisasiService = new LegalisasiService();
