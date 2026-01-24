/**
 * Signing Controller
 * HTTP handlers untuk proses signing dokumen
 */

import { signingService } from './signing.service';
import { successResponse, errorResponse } from '../../shared/utils/response';
import { HTTP_STATUS } from '../../shared/constants/http-status';
import type { SignDocumentDTO, SigningMethod, TembusanItem } from './hasil.types';

// ============================================================================
// Controller Class
// ============================================================================

class SigningController {
  /**
   * GET /signing/pending
   * Get documents pending signature for current user
   */
  async getPendingSignatures(
    userRole: string,
    params: { page?: number; limit?: number }
  ) {
    try {
      const result = await signingService.getPendingSignatures(userRole, params);
      return successResponse('Berhasil mengambil daftar dokumen pending', result);
    } catch (error) {
      console.error('Error getting pending signatures:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal mengambil daftar dokumen pending',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * GET /signing/:id
   * Get signature detail for signing
   */
  async getSignatureDetail(signatureId: string, userId: string, userRole: string) {
    try {
      const result = await signingService.getSignatureDetail(signatureId, userId, userRole);
      return successResponse('Berhasil mengambil detail tanda tangan', result);
    } catch (error) {
      console.error('Error getting signature detail:', error);
      const status =
        error instanceof Error && error.message.includes('tidak ditemukan')
          ? HTTP_STATUS.NOT_FOUND
          : error instanceof Error && error.message.includes('akses')
          ? HTTP_STATUS.FORBIDDEN
          : HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal mengambil detail tanda tangan',
        status
      );
    }
  }

  /**
   * POST /signing/sign
   * Sign a document
   */
  async signDocument(
    userId: string,
    userRole: string,
    body: {
      signatureId: string;
      letterInstanceId: string;
      method: SigningMethod;
      savedSignatureId?: string;
      signatureFile?: File;
      saveAsTemplate?: boolean;
      templateAlias?: string;
    }
  ) {
    try {
      const input: SignDocumentDTO = {
        letterInstanceId: body.letterInstanceId,
        signatureId: body.signatureId,
        method: body.method,
        savedSignatureId: body.savedSignatureId,
        signatureFile: body.signatureFile,
        saveAsTemplate: body.saveAsTemplate,
        templateAlias: body.templateAlias,
      };

      const result = await signingService.signDocument(input, userId, userRole);
      return successResponse(result.message, result);
    } catch (error) {
      console.error('Error signing document:', error);
      const status =
        error instanceof Error && error.message.includes('tidak ditemukan')
          ? HTTP_STATUS.NOT_FOUND
          : error instanceof Error && error.message.includes('akses')
          ? HTTP_STATUS.FORBIDDEN
          : error instanceof Error && error.message.includes('wewenang')
          ? HTTP_STATUS.FORBIDDEN
          : error instanceof Error && error.message.includes('diperlukan')
          ? HTTP_STATUS.BAD_REQUEST
          : HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal menandatangani dokumen',
        status
      );
    }
  }

  /**
   * POST /signing/generate-draft
   * Generate HTML draft from template
   */
  async generateDraft(
    userId: string,
    body: {
      letterInstanceId: string;
      templateHtml: string;
      variables: Record<string, string | number | Date>;
      tembusan?: TembusanItem[];
    }
  ) {
    try {
      const result = await signingService.generateDraft(
        body.letterInstanceId,
        body.templateHtml,
        body.variables,
        body.tembusan
      );
      return successResponse('Berhasil generate draft', result);
    } catch (error) {
      console.error('Error generating draft:', error);
      return errorResponse(
        error instanceof Error ? error.message : 'Gagal generate draft',
        HTTP_STATUS.INTERNAL_SERVER_ERROR
      );
    }
  }
}

export const signingController = new SigningController();
