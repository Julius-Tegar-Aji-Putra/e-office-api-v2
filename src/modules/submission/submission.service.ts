/**
 * Submission Service
 * Business logic layer untuk modul pengajuan surat
 * Mengikuti flow dari Prompting.md Modul A: SUBMISSION
 */

import { submissionRepository, SubmissionRepository } from './submission.repository';
import { ROLES } from '../../shared/constants/roles';
import { getDisplayStatus, DISPLAY_STATUS } from '../../shared/constants/status-mapping';
import { ERROR_MESSAGES } from '../../shared/constants/error-messages';
import { minioService, MinioService } from '../../shared/services/minio.service';
import { prisma } from '../../db';
import type { LetterStatus, LogAction } from '../../generated/prisma/enums';
import type {
  CreateSubmissionDTO,
  SubmissionFormData,
  SignatureConfigDTO,
  SubmissionFilter,
  SubmissionSort,
  SubmissionListItem,
  SubmissionDetail,
  SubmissionPermissions,
  LetterTypeWithTemplate,
  AttachmentSummary,
} from './submission.types';

// ============================================================================
// Service Class
// ============================================================================

export class SubmissionService {
  constructor(
    private repository: SubmissionRepository = submissionRepository,
    private minio: MinioService = minioService
  ) {}

  // ============================================================================
  // Letter Types
  // ============================================================================

  /**
   * Get all available letter types for submission form
   */
  async getLetterTypes(): Promise<LetterTypeWithTemplate[]> {
    const types = await this.repository.getLetterTypes();

    return types.map((type: any) => ({
      id: type.id,
      name: type.name,
      code: type.code,
      description: type.description,
      category: type.category,
      requiresPengantar: type.requiresPengantar,
      requiresDekanSign: type.requiresDekanSign,
      requiresWadekSign: type.requiresWadekSign,
      defaultTargetSigner: type.defaultTargetSigner,
      activeTemplate: type.templates[0]
        ? {
            id: type.templates[0].id,
            versionName: type.templates[0].versionName,
            schemaDefinition: type.templates[0].schemaDefinition,
            formFields: type.templates[0].formFields,
          }
        : null,
    }));
  }

  /**
   * Get single letter type by ID
   */
  async getLetterTypeById(id: string): Promise<LetterTypeWithTemplate | null> {
    const type = await this.repository.getLetterTypeById(id);
    if (!type) return null;

    return {
      id: type.id,
      name: type.name,
      code: type.code,
      description: type.description,
      category: type.category,
      requiresPengantar: type.requiresPengantar,
      requiresDekanSign: type.requiresDekanSign,
      requiresWadekSign: type.requiresWadekSign,
      defaultTargetSigner: type.defaultTargetSigner,
      activeTemplate: type.templates[0]
        ? {
            id: type.templates[0].id,
            versionName: type.templates[0].versionName,
            schemaDefinition: type.templates[0].schemaDefinition,
            formFields: type.templates[0].formFields,
          }
        : null,
    };
  }

  // ============================================================================
  // Submissions CRUD
  // ============================================================================

  /**
   * Get submissions by creator (Mahasiswa/Dosen)
   * Dashboard view for submitter
   */
  async getMySubmissions(
    userId: string,
    filter: SubmissionFilter = {},
    sort: SubmissionSort = { field: 'submittedAt', order: 'desc' },
    pagination: { page: number; limit: number } = { page: 1, limit: 10 }
  ) {
    const skip = (pagination.page - 1) * pagination.limit;
    const take = pagination.limit;

    const { items, total } = await this.repository.findByCreator(userId, filter, sort, { skip, take });

    // Transform to list items with display status
    const data: SubmissionListItem[] = items.map((item: any) => {
      const formData = item.submissionValues as unknown as SubmissionFormData;
      return {
        id: item.id,
        judulSurat: formData?.judulAcara || '-',
        jenisSurat: formData?.jenisSurat === 'SURAT_TUGAS' ? 'SURAT_TUGAS' : 'SURAT_KEPUTUSAN',
        tanggalPengajuan: item.submittedAt,
        status: item.status,
        displayStatus: getDisplayStatus(item.status, ROLES.MAHASISWA, item.currentActiveRole),
        canEdit: this.canEditSubmission(item.status),
        canCancel: this.canCancelSubmission(item.status),
        letterType: {
          id: item.letterType.id,
          name: item.letterType.name,
          code: item.letterType.code,
        },
      };
    });

    return {
      data,
      meta: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  /**
   * Get submission detail by ID
   * Include signed URLs for attachments
   */
  async getSubmissionById(id: string, viewerRole: string): Promise<SubmissionDetail | null> {
    const submission = await this.repository.findById(id);
    if (!submission) return null;

    const formData = submission.submissionValues as unknown as SubmissionFormData;
    const sigConfig = submission.signatureConfig as unknown as SignatureConfigDTO | null;

    // Get rejection reason from logs if any
    const rejectionLog = submission.logs.find(
      (log: any) => log.action === 'REJECT' || log.action === 'RETURN'
    );

    // Map attachments with signed URLs
    const attachmentsWithUrls: AttachmentSummary[] = await Promise.all(
      submission.attachments.map(async (att: any) => {
        let fileUrl = att.fileUrl;
        
        if (att.storagePath) {
          try {
            fileUrl = await this.minio.getFileUrl(att.storagePath);
          } catch (error) {
            console.error(`Failed to get signed URL for ${att.storagePath}:`, error);
          }
        }
        
        return {
          id: att.id,
          fileName: att.fileName,
          fileUrl: fileUrl || '',
          fileSize: att.fileSize,
          mimeType: att.mimeType,
          description: att.description,
          uploadedAt: att.uploadedAt,
        };
      })
    );

    return {
      id: submission.id,
      submissionValues: formData,
      status: submission.status,
      displayStatus: getDisplayStatus(submission.status, viewerRole as any, submission.currentActiveRole),
      priority: submission.priority,
      currentActiveRole: submission.currentActiveRole,
      signatureConfig: sigConfig,
      letterType: {
        id: submission.letterType.id,
        name: submission.letterType.name,
        code: submission.letterType.code,
        category: submission.letterType.category,
      },
      createdBy: {
        id: submission.createdBy.id,
        name: submission.createdBy.name,
        email: submission.createdBy.email,
      },
      documents: submission.documents.map((doc: any) => ({
        id: doc.id,
        type: doc.type,
        nomorSurat: doc.nomorSurat,
        tanggalSurat: doc.tanggalSurat,
        perihal: doc.perihal,
        isSigned: doc.isSigned,
        fileUrl: doc.fileUrl,
        signatures: doc.signatures.map((sig: any) => ({
          signerRole: sig.signerRole,
          signerName: sig.signerName,
          signedAt: sig.signedAt,
          order: sig.order,
        })),
      })),
      attachments: attachmentsWithUrls,
      logs: submission.logs.map((log: any) => ({
        id: log.id,
        action: log.action,
        actorName: log.actor.name,
        actorRole: log.actorRole,
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        notes: log.notes,
        createdAt: log.createdAt,
      })),
      submittedAt: submission.submittedAt,
      completedAt: submission.completedAt,
      permissions: this.computePermissions(submission.status, viewerRole, submission.createdById, rejectionLog?.notes),
    };
  }

  /**
   * Create new submission with attachments
   * Flow: Mahasiswa/Dosen submit -> Status SUBMITTED -> Role KAPRODI
   * Uses transaction for atomicity with MinIO rollback on failure
   */
  async createSubmission(userId: string, dto: CreateSubmissionDTO, files?: File[]) {
    // Validate letter type exists
    const letterType = await this.repository.getLetterTypeById(dto.letterTypeId);
    if (!letterType) {
      throw new Error(ERROR_MESSAGES.SUBMISSION.INVALID_TYPE);
    }

    // Track uploaded files for rollback
    const uploadedFiles: Array<{ storagePath: string }> = [];

    try {
      // Upload files to MinIO first
      const attachmentData: Array<{
        fileName: string;
        storageName: string;
        storagePath: string;
        fileSize: number;
        mimeType: string;
        uploadedById: string;
      }> = [];

      if (files && files.length > 0) {
        for (const file of files) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const uploadResult = await this.minio.uploadFile(
            buffer,
            file.name,
            file.type,
            'submissions'
          );

          uploadedFiles.push({ storagePath: uploadResult.path });

          attachmentData.push({
            fileName: file.name,
            storageName: uploadResult.storageName,
            storagePath: uploadResult.path,
            fileSize: file.size,
            mimeType: file.type,
            uploadedById: userId,
          });
        }
      }

      // Create submission with attachments in transaction
      const submission = await prisma.$transaction(async (tx) => {
        // Create letter instance
        const letterInstance = await tx.letterInstance.create({
          data: {
            letterTypeId: dto.letterTypeId,
            createdById: userId,
            submissionValues: dto.formData as object,
            signatureConfig: dto.signatureConfig as object,
            status: 'SUBMITTED' as LetterStatus,
            currentActiveRole: ROLES.KAPRODI,
          },
        });

        // Create attachments if any
        if (attachmentData.length > 0) {
          await tx.letterAttachment.createMany({
            data: attachmentData.map((att) => ({
              letterInstanceId: letterInstance.id,
              fileName: att.fileName,
              storageName: att.storageName,
              storagePath: att.storagePath,
              fileSize: att.fileSize,
              mimeType: att.mimeType,
              uploadedById: att.uploadedById,
            })),
          });
        }

        // Create initial log
        await tx.letterLog.create({
          data: {
            letterInstanceId: letterInstance.id,
            actorId: userId,
            actorRole: 'PENGAJU',
            action: 'SUBMIT' as LogAction,
            toStatus: 'SUBMITTED' as LetterStatus,
            notes: `Pengajuan surat baru${attachmentData.length > 0 ? ` dengan ${attachmentData.length} lampiran` : ''}`,
          },
        });

        return letterInstance;
      });

      return {
        id: submission.id,
        message: 'Pengajuan berhasil dibuat dan diteruskan ke Ketua Program Studi untuk diverifikasi',
        status: submission.status,
        currentActiveRole: ROLES.KAPRODI,
        attachmentCount: attachmentData.length,
      };
    } catch (error) {
      // Rollback: Delete uploaded files from MinIO if transaction failed
      if (uploadedFiles.length > 0) {
        console.log('Rolling back MinIO uploads...');
        for (const file of uploadedFiles) {
          try {
            await this.minio.deleteFile(file.storagePath);
          } catch (deleteError) {
            console.error(`Failed to delete file during rollback: ${file.storagePath}`, deleteError);
          }
        }
      }
      throw error;
    }
  }

  /**
   * Update submission (revisi)
   * Only allowed when status allows edit
   */
  async updateSubmission(
    id: string,
    userId: string,
    formData: Partial<SubmissionFormData>,
    signatureConfig?: Partial<SignatureConfigDTO>
  ) {
    // Verify ownership
    const isOwner = await this.repository.isOwner(id, userId);
    if (!isOwner) {
      throw new Error(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    // Get current submission to check status
    const current = await this.repository.findById(id);
    if (!current) {
      throw new Error(ERROR_MESSAGES.SUBMISSION.NOT_FOUND);
    }

    // Check if editable
    if (!this.canEditSubmission(current.status)) {
      throw new Error('Pengajuan tidak dapat diubah pada status saat ini');
    }

    // Merge with existing data
    const existingFormData = current.submissionValues as unknown as SubmissionFormData;
    const existingSigConfig = current.signatureConfig as unknown as SignatureConfigDTO;

    const updated = await this.repository.updateSubmissionValues(
      id,
      {
        submissionValues: { ...existingFormData, ...formData } as unknown as Record<string, unknown>,
        ...(signatureConfig && {
          signatureConfig: { ...existingSigConfig, ...signatureConfig } as unknown as Record<string, unknown>,
        }),
      },
      userId,
      'PENGAJU'
    );

    return {
      id: updated.id,
      message: 'Pengajuan berhasil diperbarui',
    };
  }

  /**
   * Cancel submission
   * Only allowed by owner when status allows
   */
  async cancelSubmission(id: string, userId: string, alasan?: string) {
    // Verify ownership
    const isOwner = await this.repository.isOwner(id, userId);
    if (!isOwner) {
      throw new Error(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    // Get current to check status
    const current = await this.repository.findById(id);
    if (!current) {
      throw new Error(ERROR_MESSAGES.SUBMISSION.NOT_FOUND);
    }

    if (!this.canCancelSubmission(current.status)) {
      throw new Error('Pengajuan tidak dapat dibatalkan pada status saat ini');
    }

    await this.repository.cancel(id, userId, alasan);

    return {
      id,
      message: 'Pengajuan berhasil dibatalkan',
    };
  }

  // ============================================================================
  // Attachments
  // ============================================================================

  /**
   * Add attachment to submission with MinIO upload
   */
  async addAttachment(
    letterInstanceId: string,
    userId: string,
    file: File,
    description?: string
  ) {
    // Verify ownership
    const isOwner = await this.repository.isOwner(letterInstanceId, userId);
    if (!isOwner) {
      throw new Error(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    // Check submission status allows adding attachments
    const submission = await this.repository.findById(letterInstanceId);
    if (!submission) {
      throw new Error(ERROR_MESSAGES.SUBMISSION.NOT_FOUND);
    }

    if (!this.canEditSubmission(submission.status)) {
      throw new Error('Tidak dapat menambah lampiran pada status saat ini');
    }

    // Upload to MinIO
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadResult = await this.minio.uploadFile(
      buffer,
      file.name,
      file.type,
      'submissions'
    );

    // Save to database
    const attachment = await this.repository.addAttachment({
      letterInstanceId,
      fileName: file.name,
      storageName: uploadResult.storageName,
      storagePath: uploadResult.path,
      fileSize: file.size,
      mimeType: file.type,
      description,
      uploadedById: userId,
    });

    // Get signed URL for response
    const fileUrl = await this.minio.getFileUrl(uploadResult.path);

    return {
      id: attachment.id,
      fileName: attachment.fileName,
      fileUrl,
      fileSize: attachment.fileSize,
      mimeType: attachment.mimeType,
      uploadedAt: attachment.uploadedAt,
    };
  }

  /**
   * Remove attachment with MinIO deletion
   */
  async removeAttachment(attachmentId: string, letterInstanceId: string, userId: string) {
    // Verify ownership
    const isOwner = await this.repository.isOwner(letterInstanceId, userId);
    if (!isOwner) {
      throw new Error(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    // Check submission status allows removing attachments
    const submission = await this.repository.findById(letterInstanceId);
    if (!submission) {
      throw new Error(ERROR_MESSAGES.SUBMISSION.NOT_FOUND);
    }

    if (!this.canEditSubmission(submission.status)) {
      throw new Error('Tidak dapat menghapus lampiran pada status saat ini');
    }

    // Get attachment details for MinIO deletion
    const attachment = await this.repository.getAttachmentById(attachmentId);
    if (!attachment) {
      throw new Error('Lampiran tidak ditemukan');
    }

    // Delete from database first
    await this.repository.removeAttachment(attachmentId, letterInstanceId);

    // Delete from MinIO
    if (attachment.storagePath) {
      try {
        await this.minio.deleteFile(attachment.storagePath);
      } catch (error) {
        console.error(`Failed to delete file from MinIO: ${attachment.storagePath}`, error);
      }
    }

    return { message: 'Lampiran berhasil dihapus' };
  }

  /**
   * Get signed URL for attachment download
   */
  async getAttachmentUrl(attachmentId: string, letterInstanceId: string, userId: string) {
    // Verify ownership or authorized role
    const submission = await this.repository.findById(letterInstanceId);
    if (!submission) {
      throw new Error(ERROR_MESSAGES.SUBMISSION.NOT_FOUND);
    }

    const attachment = await this.repository.getAttachmentById(attachmentId);
    if (!attachment || attachment.letterInstanceId !== letterInstanceId) {
      throw new Error('Lampiran tidak ditemukan');
    }

    if (!attachment.storagePath) {
      throw new Error('File tidak tersedia');
    }

    const fileUrl = await this.minio.getFileUrl(attachment.storagePath);

    return {
      fileName: attachment.fileName,
      fileUrl,
      mimeType: attachment.mimeType,
    };
  }

  // ============================================================================
  // Permission Helpers
  // ============================================================================

  /**
   * Check if submission can be edited
   * Sesuai Prompting.md: hanya jika DRAFT atau dikembalikan
   */
  private canEditSubmission(status: LetterStatus): boolean {
    const editableStatuses: LetterStatus[] = ['SUBMITTED']; // Before Kaprodi review
    return editableStatuses.includes(status);
  }

  /**
   * Check if submission can be cancelled
   * Sesuai Prompting.md: sebelum masuk fakultas
   */
  private canCancelSubmission(status: LetterStatus): boolean {
    const cancellableStatuses: LetterStatus[] = [
      'SUBMITTED',
      'KAPRODI_REVIEW',
      'SURAT_PENGANTAR_DRAFT',
      'SURAT_PENGANTAR_REVIEW',
    ];
    return cancellableStatuses.includes(status);
  }

  /**
   * Compute permissions for frontend
   * Sesuai Prompting.md Section 6: Logic Tampilan Detail & Aksi
   */
  private computePermissions(
    status: LetterStatus,
    viewerRole: string,
    createdById: string,
    rejectionReason?: string | null
  ): SubmissionPermissions {
    const isSubmitter = viewerRole === ROLES.MAHASISWA || viewerRole === ROLES.DOSEN;
    const isCompleted = status === 'COMPLETED';
    const isRejected = status === 'REJECTED' || status === 'CANCELLED';

    // Surat Pengantar exists when status >= SURAT_PENGANTAR_DRAFT
    const hasPengantar = [
      'SURAT_PENGANTAR_DRAFT',
      'SURAT_PENGANTAR_REVIEW',
      'SURAT_PENGANTAR_SIGNED',
      'FAKULTAS_RECEIVED',
      'FAKULTAS_DISPOSITION',
      'FAKULTAS_DRAFTING',
      'FAKULTAS_VERIFICATION',
      'FAKULTAS_SIGNING',
      'UPA_NUMBERING',
      'UPA_STAMPING',
      'UPA_FINALIZING',
      'COMPLETED',
    ].includes(status);

    // Surat Hasil exists when status >= FAKULTAS_DRAFTING
    const hasHasil = [
      'FAKULTAS_DRAFTING',
      'FAKULTAS_VERIFICATION',
      'FAKULTAS_SIGNING',
      'UPA_NUMBERING',
      'UPA_STAMPING',
      'UPA_FINALIZING',
      'COMPLETED',
    ].includes(status);

    return {
      canEdit: isSubmitter && this.canEditSubmission(status),
      canCancel: isSubmitter && this.canCancelSubmission(status),
      canDownload: isSubmitter && isCompleted,
      canResubmit: false, // Will be true when returned
      showSuratPengantar: hasPengantar,
      showSuratHasil: hasHasil && isCompleted, // For submitter, only show when completed
      showFormulirAwal: true, // Always show
      showRiwayat: true, // Always show
      showAlasanDitolak: isRejected && !!rejectionReason,
    };
  }
}

// Singleton instance
export const submissionService = new SubmissionService();
