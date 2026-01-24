/**
 * Signing Service
 * Business logic untuk proses signing dokumen surat hasil
 * 
 * Note:
 * - Modul ini adalah bagian dari surat-hasil (shared service)
 * - Handles: Generate Draft HTML, Sign Document, Tembusan
 */

import { signingRepository } from './signing.repository';
import { signatureService } from '../signature/signature.service';
import { MinioService } from '../../shared/services/minio.service';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http-status';
import { SignatureStatus } from '../../generated/prisma/client';
import type {
  SignDocumentDTO,
  SignDocumentResponse,
  SigningMethod,
  SIGNING_ROLES,
  TembusanItem,
  GenerateDraftResponse,
} from './hasil.types';

// ============================================================================
// Constants
// ============================================================================

const SIGNATURE_FOLDER = 'document-signatures';

// Roles yang diperbolehkan TTD
const ALLOWED_SIGNING_ROLES = [
  'KAPRODI',
  'KADEP',
  'DEKAN',
  'WAKIL_DEKAN_1',
  'WAKIL_DEKAN_2',
] as const;

// ============================================================================
// Template Processing
// ============================================================================

/**
 * Replace template variables in HTML
 * Variables format: {{variableName}}
 */
function replaceTemplateVariables(
  templateHtml: string,
  variables: Record<string, string | number | Date | undefined>
): string {
  let result = templateHtml;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    let replacement = '';

    if (value instanceof Date) {
      // Format date for Indonesian locale
      replacement = value.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } else if (value !== undefined && value !== null) {
      replacement = String(value);
    }

    // Replace all occurrences
    result = result.split(placeholder).join(replacement);
  }

  return result;
}

/**
 * Format tembusan list to HTML
 */
function formatTembusanHtml(tembusan: TembusanItem[]): string {
  if (!tembusan || tembusan.length === 0) {
    return '';
  }

  const items = tembusan
    .map((item, index) => {
      const text = item.type === 'USER' && item.label ? item.label : item.value;
      return `<li>${index + 1}. ${text}</li>`;
    })
    .join('\n');

  return `
    <div class="tembusan">
      <p><strong>Tembusan:</strong></p>
      <ol>
        ${items}
      </ol>
    </div>
  `;
}

// ============================================================================
// Service Class
// ============================================================================

class SigningService {
  private minio: MinioService;

  constructor() {
    this.minio = new MinioService();
  }

  /**
   * Generate draft HTML from template with variable replacement
   */
  async generateDraft(
    letterInstanceId: string,
    templateHtml: string,
    variables: Record<string, string | number | Date | undefined>,
    tembusan?: TembusanItem[]
  ): Promise<GenerateDraftResponse> {
    // Replace variables in template
    let contentHtml = replaceTemplateVariables(templateHtml, variables);

    // Add tembusan if provided
    if (tembusan && tembusan.length > 0) {
      const tembusanHtml = formatTembusanHtml(tembusan);
      // Append before closing body or at the end
      contentHtml = contentHtml.replace('</body>', `${tembusanHtml}</body>`);
      // If no body tag, just append
      if (!contentHtml.includes('</body>')) {
        contentHtml += tembusanHtml;
      }
    }

    // Save to database
    await signingRepository.updateLetterHtml({
      letterInstanceId,
      contentHtml,
    });

    return {
      letterInstanceId,
      contentHtml,
      variables,
      tembusan: tembusan || [],
    };
  }

  /**
   * Get documents pending signature for current user's role
   */
  async getPendingSignatures(userRole: string, params: { page?: number; limit?: number }) {
    // Check if role is allowed to sign
    if (!ALLOWED_SIGNING_ROLES.includes(userRole as any)) {
      return {
        data: [],
        total: 0,
        page: params.page || 1,
        limit: params.limit || 10,
        totalPages: 0,
      };
    }

    return signingRepository.getDocumentsPendingSignature(userRole, params);
  }

  /**
   * Get signature detail for signing
   */
  async getSignatureDetail(signatureId: string, userId: string, userRole: string) {
    const signature = await signingRepository.getSignatureById(signatureId);

    if (!signature) {
      throw new AppError('Tanda tangan tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Verify this signature is for user's role
    if (signature.signerRole !== userRole) {
      throw new AppError('Anda tidak memiliki akses untuk menandatangani dokumen ini', HTTP_STATUS.FORBIDDEN);
    }

    // Check if can sign (previous signatures completed)
    const canSignCheck = await signingRepository.canSign(signature.documentId, userRole);

    return {
      signature,
      canSign: canSignCheck.canSign,
      reason: canSignCheck.reason,
    };
  }

  /**
   * Sign document with one of 3 methods: UPLOAD, CANVAS, or SAVED
   */
  async signDocument(
    input: SignDocumentDTO,
    userId: string,
    userRole: string
  ): Promise<SignDocumentResponse> {
    // 1. Validate user role is allowed to sign
    if (!ALLOWED_SIGNING_ROLES.includes(userRole as any)) {
      throw new AppError('Role Anda tidak memiliki wewenang untuk menandatangani', HTTP_STATUS.FORBIDDEN);
    }

    // 2. Get signature record
    const signature = await signingRepository.getSignatureById(input.signatureId);

    if (!signature) {
      throw new AppError('Tanda tangan tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // 3. Verify signature is for this user's role
    if (signature.signerRole !== userRole) {
      throw new AppError('Anda tidak memiliki akses untuk menandatangani dokumen ini', HTTP_STATUS.FORBIDDEN);
    }

    // 4. Check if already signed
    if (signature.status === SignatureStatus.SIGNED) {
      throw new AppError('Dokumen sudah ditandatangani', HTTP_STATUS.BAD_REQUEST);
    }

    // 5. Check if can sign (previous signatures completed)
    const canSignCheck = await signingRepository.canSign(signature.documentId, userRole);
    if (!canSignCheck.canSign) {
      throw new AppError(canSignCheck.reason || 'Tidak dapat menandatangani saat ini', HTTP_STATUS.BAD_REQUEST);
    }

    // 6. Get signature image URL based on method
    let signatureImageUrl: string;

    switch (input.method) {
      case 'SAVED':
        // Use existing saved signature
        if (!input.savedSignatureId) {
          throw new AppError('savedSignatureId diperlukan untuk method SAVED', HTTP_STATUS.BAD_REQUEST);
        }
        signatureImageUrl = await signatureService.getSignatureUrl(input.savedSignatureId, userId);
        break;

      case 'UPLOAD':
      case 'CANVAS':
        // Upload new signature file
        if (!input.signatureFile) {
          throw new AppError('signatureFile diperlukan untuk method UPLOAD/CANVAS', HTTP_STATUS.BAD_REQUEST);
        }
        signatureImageUrl = await this.uploadSignatureImage(input.signatureFile, userId);
        break;

      default:
        throw new AppError('Method tidak valid', HTTP_STATUS.BAD_REQUEST);
    }

    // 7. Sign the document
    const signedAt = new Date();
    const result = await signingRepository.signDocument(
      {
        signatureId: input.signatureId,
        signatureUrl: signatureImageUrl,
        signedAt,
      },
      userId,
      userRole
    );

    // 8. Optionally save as template
    let savedTemplate: { id: string; alias: string | null } | undefined;
    if (input.saveAsTemplate && (input.method === 'UPLOAD' || input.method === 'CANVAS')) {
      try {
        const template = await signatureService.copyToTemplate(
          signatureImageUrl,
          userId,
          input.templateAlias
        );
        savedTemplate = {
          id: template.id,
          alias: template.alias,
        };
      } catch (error) {
        // Don't fail the signing if template save fails
        console.error('Failed to save signature as template:', error);
      }
    }

    return {
      success: true,
      message: 'Dokumen berhasil ditandatangani',
      signature: {
        id: result.signature.id,
        signerRole: result.signature.signerRole,
        signerName: result.signature.signerName,
        status: SignatureStatus.SIGNED,
        signedAt,
      },
      savedTemplate,
    };
  }

  /**
   * Upload signature image to MinIO
   */
  private async uploadSignatureImage(file: File, userId: string): Promise<string> {
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const uploadResult = await this.minio.uploadFile(
      fileBuffer,
      file.name,
      file.type,
      SIGNATURE_FOLDER
    );

    // Return the path (not signed URL, as we need persistent reference)
    return uploadResult.path;
  }

  /**
   * Get signed URL for signature image (for display purposes)
   */
  async getSignatureImageUrl(storagePath: string): Promise<string> {
    return this.minio.getFileUrl(storagePath);
  }
}

export const signingService = new SigningService();
