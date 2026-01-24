/**
 * Submission Service
 * Business logic layer untuk modul pengajuan surat
 * Mengikuti flow dari Prompting.md Modul A: SUBMISSION
 */

import { submissionRepository, SubmissionRepository } from './submission.repository';
import { ROLES } from '../../shared/constants/roles';
import { getDisplayStatus, DISPLAY_STATUS } from '../../shared/constants/status-mapping';
import { ERROR_MESSAGES } from '../../shared/constants/error-messages';
import type { LetterStatus } from '../../generated/prisma/enums';
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
} from './submission.types';

// ============================================================================
// Service Class
// ============================================================================

export class SubmissionService {
  constructor(private repository: SubmissionRepository = submissionRepository) {}

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
      attachments: submission.attachments.map((att: any) => ({
        id: att.id,
        fileName: att.fileName,
        fileUrl: att.fileUrl,
        fileSize: att.fileSize,
        mimeType: att.mimeType,
        description: att.description,
        uploadedAt: att.uploadedAt,
      })),
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
   * Create new submission
   * Flow: Mahasiswa/Dosen submit -> Status SUBMITTED -> Role KAPRODI
   */
  async createSubmission(userId: string, dto: CreateSubmissionDTO) {
    // Validate letter type exists
    const letterType = await this.repository.getLetterTypeById(dto.letterTypeId);
    if (!letterType) {
      throw new Error(ERROR_MESSAGES.SUBMISSION.INVALID_TYPE);
    }

    // Create submission with initial status
    const submission = await this.repository.create({
      letterTypeId: dto.letterTypeId,
      createdById: userId,
      submissionValues: dto.formData as unknown as Record<string, unknown>,
      signatureConfig: dto.signatureConfig as unknown as Record<string, unknown>,
      status: 'SUBMITTED' as LetterStatus,
      currentActiveRole: ROLES.KAPRODI, // Goes to Kaprodi for initial review
    });

    return {
      id: submission.id,
      message: 'Pengajuan berhasil dibuat dan diteruskan ke Ketua Program Studi untuk diverifikasi',
      status: submission.status,
      currentActiveRole: ROLES.KAPRODI,
    };
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
   * Add attachment to submission
   */
  async addAttachment(
    letterInstanceId: string,
    userId: string,
    file: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string },
    description?: string
  ) {
    // Verify ownership
    const isOwner = await this.repository.isOwner(letterInstanceId, userId);
    if (!isOwner) {
      throw new Error(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    const attachment = await this.repository.addAttachment({
      letterInstanceId,
      fileName: file.fileName,
      fileUrl: file.fileUrl,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      description,
      uploadedById: userId,
    });

    return attachment;
  }

  /**
   * Remove attachment
   */
  async removeAttachment(attachmentId: string, letterInstanceId: string, userId: string) {
    // Verify ownership
    const isOwner = await this.repository.isOwner(letterInstanceId, userId);
    if (!isOwner) {
      throw new Error(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
    }

    await this.repository.removeAttachment(attachmentId, letterInstanceId);

    return { message: 'Lampiran berhasil dihapus' };
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
