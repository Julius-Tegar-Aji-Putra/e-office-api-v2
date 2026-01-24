/**
 * Signature Controller
 * HTTP handlers untuk manajemen saved signatures
 */

import { signatureService } from './signature.service';
import { validateSignatureFile } from './signature.validation';
import { successResponse, errorResponse } from '../../shared/utils/response';
import { HTTP_STATUS } from '../../shared/constants/http-status';
import type { SignatureUploadMethod } from './signature.types';

// ============================================================================
// Controller Class
// ============================================================================

class SignatureController {
  /**
   * GET /signatures/me
   * Get all saved signatures for current user
   */
  async getMySignatures(userId: string) {
    try {
      const result = await signatureService.getMySignatures(userId);
      return successResponse('Berhasil mengambil daftar tanda tangan', result);
    } catch (error) {
      console.error('Error getting signatures:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal mengambil daftar tanda tangan',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * GET /signatures/:id
   * Get signature detail by ID
   */
  async getSignatureById(signatureId: string, userId: string) {
    try {
      const result = await signatureService.getSignatureById(signatureId, userId);
      return successResponse('Berhasil mengambil detail tanda tangan', result);
    } catch (error) {
      console.error('Error getting signature:', error);
      const status =
        error instanceof Error && error.message.includes('tidak ditemukan')
          ? HTTP_STATUS.NOT_FOUND
          : HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal mengambil detail tanda tangan',
        status
      );
    }
  }

  /**
   * POST /signatures/upload
   * Upload new signature (file or canvas drawing)
   */
  async uploadSignature(
    userId: string,
    file: File,
    method: SignatureUploadMethod,
    alias?: string
  ) {
    try {
      // Validate file
      const validation = validateSignatureFile(file);
      if (!validation.valid) {
        return errorResponse(validation.error!, HTTP_STATUS.BAD_REQUEST);
      }

      const result = await signatureService.uploadSignature(userId, file, method, alias);
      return successResponse(result.message, result);
    } catch (error) {
      console.error('Error uploading signature:', error);
      const status =
        error instanceof Error && error.message.includes('Maksimal')
          ? HTTP_STATUS.BAD_REQUEST
          : HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal mengunggah tanda tangan',
        status
      );
    }
  }

  /**
   * PATCH /signatures/:id
   * Update signature alias only
   */
  async updateSignatureAlias(signatureId: string, userId: string, alias?: string) {
    try {
      const result = await signatureService.updateSignatureAlias(
        signatureId,
        userId,
        alias || null
      );
      return successResponse('Alias tanda tangan berhasil diperbarui', result);
    } catch (error) {
      console.error('Error updating signature:', error);
      const status =
        error instanceof Error && error.message.includes('tidak ditemukan')
          ? HTTP_STATUS.NOT_FOUND
          : HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal memperbarui alias',
        status
      );
    }
  }

  /**
   * DELETE /signatures/:id
   * Delete saved signature
   */
  async deleteSignature(signatureId: string, userId: string) {
    try {
      const result = await signatureService.deleteSignature(signatureId, userId);
      return successResponse(result.message);
    } catch (error) {
      console.error('Error deleting signature:', error);
      const status =
        error instanceof Error && error.message.includes('tidak ditemukan')
          ? HTTP_STATUS.NOT_FOUND
          : HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal menghapus tanda tangan',
        status
      );
    }
  }
}

export const signatureController = new SignatureController();
