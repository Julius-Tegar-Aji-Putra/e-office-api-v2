/**
 * Signature Service
 * Business logic untuk manajemen saved signatures personal user
 * 
 * Note: 
 * - Modul ini HANYA untuk manage saved signatures (template TTD)
 * - Untuk proses signing dokumen, gunakan hasil.service.ts -> signDocument()
 * - Saved signature bersifat PRIVATE per user (tidak global)
 */

import { signatureRepository, CreateSavedSignatureInput } from './signature.repository';
import { MinioService } from '../../shared/services/minio.service';
import { SignatureType } from '../../generated/prisma/client';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http-status';
import type {
  SavedSignatureItem,
  SavedSignatureListResponse,
  UploadSignatureResponse,
  DeleteSignatureResponse,
  SignatureUploadMethod,
} from './signature.types';

// ============================================================================
// Constants
// ============================================================================

const MAX_SIGNATURES_PER_USER = 10; // Maximum saved signatures per user
const SIGNATURE_FOLDER = 'signatures'; // Folder for signature files in MinIO

// ============================================================================
// Service Class
// ============================================================================

class SignatureService {
  private minio: MinioService;

  constructor() {
    this.minio = new MinioService();
  }

  /**
   * Get all saved signatures for current user
   */
  async getMySignatures(userId: string): Promise<SavedSignatureListResponse> {
    const signatures = await signatureRepository.getSavedSignaturesByUser(userId);

    // Convert storage paths to signed URLs
    const data: SavedSignatureItem[] = await Promise.all(
      signatures.map(async (sig) => {
        let signedUrl = sig.fileUrl;
        
        // If fileUrl is a storage path (not a full URL), get signed URL
        if (sig.fileUrl && !sig.fileUrl.startsWith('http')) {
          try {
            signedUrl = await this.minio.getFileUrl(sig.fileUrl);
          } catch (err) {
            console.error('Failed to get signed URL for signature:', sig.id, err);
            // Keep original path if failed
          }
        }

        return {
          id: sig.id,
          type: sig.type,
          fileUrl: signedUrl,
          fileName: sig.fileName,
          alias: sig.alias,
          isActive: sig.isActive,
          createdAt: sig.createdAt,
        };
      })
    );

    return {
      data,
      total: data.length,
    };
  }

  /**
   * Get signature by ID with ownership validation
   */
  async getSignatureById(signatureId: string, userId: string): Promise<SavedSignatureItem> {
    const signature = await signatureRepository.getSignatureByIdAndUser(signatureId, userId);

    if (!signature) {
      throw new AppError('Tanda tangan tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Convert storage path to signed URL
    let signedUrl = signature.fileUrl;
    if (signature.fileUrl && !signature.fileUrl.startsWith('http')) {
      try {
        signedUrl = await this.minio.getFileUrl(signature.fileUrl);
      } catch (err) {
        console.error('Failed to get signed URL for signature:', signature.id, err);
      }
    }

    return {
      id: signature.id,
      type: signature.type,
      fileUrl: signedUrl,
      fileName: signature.fileName,
      alias: signature.alias,
      isActive: signature.isActive,
      createdAt: signature.createdAt,
    };
  }

  /**
   * Upload new signature (from file upload or canvas drawing)
   */
  async uploadSignature(
    userId: string,
    file: File,
    method: SignatureUploadMethod,
    alias?: string
  ): Promise<UploadSignatureResponse> {
    // Check limit
    const currentCount = await signatureRepository.countUserSignatures(userId);
    if (currentCount >= MAX_SIGNATURES_PER_USER) {
      throw new AppError(
        `Maksimal ${MAX_SIGNATURES_PER_USER} template tanda tangan per user`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Upload to MinIO
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await this.minio.uploadFile(
      fileBuffer,
      file.name,
      file.type,
      SIGNATURE_FOLDER
    );

    // Get signed URL for the uploaded file
    const fileUrl = await this.minio.getFileUrl(uploadResult.path);

    // Determine type based on method
    const signatureType: SignatureType =
      method === 'CANVAS' ? SignatureType.HANDWRITING : SignatureType.UPLOAD;

    // Save to database
    const input: CreateSavedSignatureInput = {
      userId,
      type: signatureType,
      fileUrl: uploadResult.path, // Store path, not signed URL (URL expires)
      fileName: uploadResult.storageName,
      alias,
    };

    const saved = await signatureRepository.createSavedSignature(input);

    return {
      id: saved.id,
      fileUrl, // Return signed URL for immediate use
      fileName: saved.fileName,
      alias: saved.alias,
      type: saved.type,
      message: 'Tanda tangan berhasil disimpan',
    };
  }

  /**
   * Update signature alias only
   * Note: Tidak ada fitur edit gambar, hanya delete dan upload baru
   */
  async updateSignatureAlias(
    signatureId: string,
    userId: string,
    alias: string | null
  ): Promise<SavedSignatureItem> {
    // Verify ownership
    const signature = await signatureRepository.getSignatureByIdAndUser(signatureId, userId);

    if (!signature) {
      throw new AppError('Tanda tangan tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    const updated = await signatureRepository.updateSignatureAlias(signatureId, alias);

    return {
      id: updated.id,
      type: updated.type,
      fileUrl: updated.fileUrl,
      fileName: updated.fileName,
      alias: updated.alias,
      isActive: updated.isActive,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Delete saved signature
   * Removes from database AND MinIO storage
   */
  async deleteSignature(signatureId: string, userId: string): Promise<DeleteSignatureResponse> {
    // Verify ownership
    const signature = await signatureRepository.getSignatureByIdAndUser(signatureId, userId);

    if (!signature) {
      throw new AppError('Tanda tangan tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Delete from MinIO (fileUrl stores the path)
    try {
      await this.minio.deleteFile(signature.fileUrl);
    } catch (error) {
      console.error('Error deleting signature file from MinIO:', error);
      // Continue even if MinIO delete fails (file might already be deleted)
    }

    // Delete from database
    await signatureRepository.deleteSignature(signatureId);

    return {
      success: true,
      message: 'Tanda tangan berhasil dihapus',
    };
  }

  /**
   * Get signature URL for use in signing process
   * This is used by hasil.service.ts when user chooses from saved templates
   */
  async getSignatureUrl(signatureId: string, userId: string): Promise<string> {
    const signature = await signatureRepository.getSignatureByIdAndUser(signatureId, userId);

    if (!signature) {
      throw new AppError('Tanda tangan tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Generate fresh signed URL
    const signedUrl = await this.minio.getFileUrl(signature.fileUrl);
    return signedUrl;
  }

  /**
   * Get signature storage path (not presigned URL) for persisting in document signatures.
   * IMPORTANT: Use this instead of getSignatureUrl when storing the reference in DB,
   * because presigned URLs expire and cause double-encoding when re-signed later.
   */
  async getSignatureStoragePath(signatureId: string, userId: string): Promise<string> {
    const signature = await signatureRepository.getSignatureByIdAndUser(signatureId, userId);

    if (!signature) {
      throw new AppError('Tanda tangan tidak ditemukan', HTTP_STATUS.NOT_FOUND);
    }

    // Return raw storage path, e.g. "signatures/2026/02/xxx.png"
    return signature.fileUrl;
  }

  /**
   * Copy signature to new template (used when saveAsTemplate = true during signing)
   */
  async copyToTemplate(
    sourceUrl: string,
    userId: string,
    alias?: string
  ): Promise<SavedSignatureItem> {
    // Check limit
    const currentCount = await signatureRepository.countUserSignatures(userId);
    if (currentCount >= MAX_SIGNATURES_PER_USER) {
      throw new AppError(
        `Maksimal ${MAX_SIGNATURES_PER_USER} template tanda tangan per user`,
        HTTP_STATUS.BAD_REQUEST
      );
    }

    // Save reference to database (URL is already in MinIO from signing process)
    const input: CreateSavedSignatureInput = {
      userId,
      type: SignatureType.UPLOAD, // Default to UPLOAD for copied signatures
      fileUrl: sourceUrl,
      fileName: `signature-${Date.now()}.png`,
      alias: alias || 'Template dari penandatanganan',
    };

    const saved = await signatureRepository.createSavedSignature(input);

    return {
      id: saved.id,
      type: saved.type,
      fileUrl: saved.fileUrl,
      fileName: saved.fileName,
      alias: saved.alias,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
    };
  }
}

export const signatureService = new SignatureService();
