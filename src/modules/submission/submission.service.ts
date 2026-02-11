/**
 * Submission Service
 * Business logic layer untuk modul pengajuan surat
 * Mengikuti flow dari Prompting.md Modul A: SUBMISSION
 */

import { submissionRepository, SubmissionRepository } from './submission.repository';
import { facultyDispositionRepository } from '../faculty-disposition/faculty-disposition.repository';
import { ROLES, getReturnTargets } from '../../shared/constants/roles';
import { getDisplayStatus, DISPLAY_STATUS } from '../../shared/constants/status-mapping';
import { ERROR_MESSAGES } from '../../shared/constants/error-messages';
import { minioService, MinioService } from '../../shared/services/minio.service';
import { prisma } from '../../db';
import type { LetterStatus, LogAction, LetterCategory } from '../../generated/prisma/enums';
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
    
    // Fetch programStudi details to get hasKaprodi flag
    let hasKaprodi = false;
    if (formData.programStudi) {
      try {
        // Try by ID first (if it's a UUID)
        let prodi = null;
        if (formData.programStudi.length > 20) {
          prodi = await prisma.programStudi.findUnique({
            where: { id: formData.programStudi },
            select: { name: true, hasKaprodi: true }
          });
          if (prodi) {
            formData.programStudi = prodi.name;
            hasKaprodi = prodi.hasKaprodi;
          }
        } else {
          // Try by name
          prodi = await prisma.programStudi.findFirst({
            where: { name: formData.programStudi },
            select: { hasKaprodi: true }
          });
          if (prodi) {
            hasKaprodi = prodi.hasKaprodi;
          }
        }
      } catch (error) {
        console.error('Failed to resolve programStudi:', error);
      }
    }
    
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

    // Compute return targets for faculty roles who can return the letter
    // ADMIN_PRODI is always the default, plus any roles that have handled the letter
    const returnTargets = await this.computeReturnTargets(submission.id, viewerRole);

    return {
      id: submission.id,
      submissionValues: formData,
      hasKaprodi, // Flag from program studi to determine if program has KAPRODI or only KADEP
      status: submission.status,
      displayStatus: getDisplayStatus(submission.status, viewerRole as any, submission.currentActiveRole),
      priority: submission.priority,
      currentActiveRole: submission.currentActiveRole,
      signatureConfig: sigConfig,
      category: submission.category || null, // Kategori yang dipilih saat forward (bisa null jika belum forward)
      returnTargets, // Available targets for returning the letter
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
        role: submission.createdBy.pegawai?.jabatan || null,
      },
      documents: await Promise.all(
        submission.documents.map(async (doc: any) => {
          // Convert fileUrl storage path to signed URL
          let signedFileUrl = doc.fileUrl;
          if (doc.fileUrl && !doc.fileUrl.startsWith('http')) {
            try {
              signedFileUrl = await this.minio.getFileUrl(doc.fileUrl);
            } catch (error) {
              console.error(`Failed to get signed URL for document ${doc.id}:`, error);
            }
          }

          // Convert attachmentUrls storage paths to signed URLs
          // Support both old format (string[]) and new format ({ url, name }[])
          let signedAttachmentUrls: Array<{ url: string; name: string }> | null = null;
          if (doc.attachmentUrls && Array.isArray(doc.attachmentUrls)) {
            signedAttachmentUrls = await Promise.all(
              doc.attachmentUrls.map(async (item: any) => {
                // Handle old string format
                if (typeof item === 'string') {
                  const urlPath = item.split('/').pop() || 'Lampiran';
                  const cleanName = urlPath.replace(/^\d+-/, ''); // Remove timestamp prefix
                  const signedUrl = item.startsWith('http') 
                    ? item 
                    : await this.minio.getFileUrl(item).catch(() => item);
                  return { url: signedUrl, name: decodeURIComponent(cleanName) };
                }
                // Handle new object format { url, name }
                const attachment = item as { url: string; name: string };
                if (attachment.url && !attachment.url.startsWith('http')) {
                  try {
                    const signedUrl = await this.minio.getFileUrl(attachment.url);
                    return { url: signedUrl, name: attachment.name };
                  } catch (error) {
                    console.error(`Failed to get signed URL for attachment:`, error);
                    return attachment;
                  }
                }
                return attachment;
              })
            );
          }

          // Convert sealImageUrl storage path to signed URL
          let signedSealImageUrl = doc.sealImageUrl;
          if (doc.sealImageUrl && !doc.sealImageUrl.startsWith('http') && !doc.sealImageUrl.startsWith('local:')) {
            try {
              signedSealImageUrl = await this.minio.getFileUrl(doc.sealImageUrl);
            } catch (error) {
              console.error(`Failed to get signed URL for seal image:`, error);
            }
          }
          // Handle local stempel (from public folder)
          if (doc.sealImageUrl && doc.sealImageUrl.startsWith('local:')) {
            // local:stempel.png -> full backend URL (e.g. http://localhost:3079/stempel.png)
            const baseUrl = process.env.BACKEND_URL || 'http://localhost:3079';
            signedSealImageUrl = `${baseUrl}/${doc.sealImageUrl.replace('local:', '')}`;
          }

          // Convert qrCodeUrl storage path to signed URL
          let signedQrCodeUrl = doc.qrCodeUrl;
          if (doc.qrCodeUrl && !doc.qrCodeUrl.startsWith('http') && !doc.qrCodeUrl.startsWith('data:')) {
            try {
              signedQrCodeUrl = await this.minio.getFileUrl(doc.qrCodeUrl);
            } catch (error) {
              console.error(`Failed to get signed URL for QR code:`, error);
            }
          }

          // Convert signature URLs to signed URLs
          const signaturesWithSignedUrls = await Promise.all(
            doc.signatures.map(async (sig: any) => {
              let signedSignatureUrl = sig.signatureUrl;
              if (sig.signatureUrl && !sig.signatureUrl.startsWith('http')) {
                try {
                  signedSignatureUrl = await this.minio.getFileUrl(sig.signatureUrl);
                } catch (error) {
                  console.error(`Failed to get signed URL for signature:`, error);
                }
              }
              return {
                signerRole: sig.signerRole,
                signerName: sig.signerName,
                signerNip: sig.signerNip || null,
                prefix: sig.prefix || null, // Awalan seperti "Mengetahui,"
                signatureUrl: signedSignatureUrl || null, // URL of the actual signature image (signed)
                signedAt: sig.signedAt,
                order: sig.order,
                // Position data for signature placement on PDF
                positionX: sig.positionX,
                positionY: sig.positionY,
                positionPage: sig.positionPage,
              };
            })
          );

          return {
            id: doc.id,
            type: doc.type,
            nomorSurat: doc.nomorSurat,
            tanggalSurat: doc.tanggalSurat,
            perihal: doc.perihal,
            isSigned: doc.isSigned,
            fileUrl: signedFileUrl,
            sealImageUrl: signedSealImageUrl || null, // Stempel URL
            qrCodeUrl: signedQrCodeUrl || null, // QR Code URL
            content: doc.content || null, // Form data untuk generate preview
            contentHtml: doc.contentHtml || null, // HTML content jika sudah di-generate
            tembusan: doc.tembusan || null, // Tembusan recipients dari draft
            attachmentUrls: signedAttachmentUrls, // Lampiran PDF/JPG/PNG dari staf/supervisor (signed URLs)
            signatures: signaturesWithSignedUrls,
          };
        })
      ),
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
      permissions: this.computePermissions(
        submission.status, 
        viewerRole, 
        submission.currentActiveRole,
        submission.createdById, 
        rejectionLog?.notes,
        submission.documents
      ),
    };
  }

  /**
   * Create new submission with attachments
   * Flow: 
   * - If prodi has Kaprodi: Status SUBMITTED -> Role KAPRODI
   * - If prodi has NO Kaprodi: Status SUBMITTED -> Role KADEP (skip Kaprodi)
   * Uses transaction for atomicity with MinIO rollback on failure
   */
  async createSubmission(userId: string, dto: CreateSubmissionDTO, files?: File[]) {
    // Validate letter type exists
    const letterType = await this.repository.getLetterTypeById(dto.letterTypeId);
    if (!letterType) {
      throw new Error(ERROR_MESSAGES.SUBMISSION.INVALID_TYPE);
    }

    // Validasi Nama
    if (!dto.formData.nama || dto.formData.nama.trim() === '') {
      throw new Error('Nama harus diisi');
    }
    if (dto.formData.nama.length > 100) {
      throw new Error('Nama maksimal 100 karakter');
    }
    // Tidak boleh mengandung angka
    if (/\d/.test(dto.formData.nama)) {
      throw new Error('Nama tidak boleh mengandung angka');
    }
    // Hanya huruf, spasi, dan tanda baca , . - ' yang diperbolehkan
    if (!/^[a-zA-Z\s,.'-]+$/.test(dto.formData.nama)) {
      throw new Error("Nama hanya boleh berisi huruf dan tanda baca (, . - ')");
    }
    // Tidak boleh spasi ganda
    if (/\s{2,}/.test(dto.formData.nama)) {
      throw new Error('Nama tidak boleh memiliki spasi ganda');
    }

    // Validasi NIM/NIP: Salah satu harus diisi
    if (!dto.formData.nim && !dto.formData.nip) {
      throw new Error('NIM atau NIP harus diisi');
    }

    // Validasi NIM jika diisi (untuk mahasiswa)
    if (dto.formData.nim) {
      // Validasi format NIM: harus tepat 14 digit angka
      if (!/^\d{14}$/.test(dto.formData.nim)) {
        throw new Error('NIM harus berupa 14 digit angka');
      }
    }

    // Validasi NIP jika diisi (untuk dosen)
    if (dto.formData.nip) {
      // Validasi format NIP: harus tepat 18 digit angka
      if (!/^\d{18}$/.test(dto.formData.nip)) {
        throw new Error('NIP harus berupa 18 digit angka');
      }
    }

    // Validasi Keperluan
    if (!dto.formData.keperluan || dto.formData.keperluan.trim() === '') {
      throw new Error('Keperluan harus diisi');
    }
    if (dto.formData.keperluan.trim().length < 5) {
      throw new Error('Keperluan minimal 5 karakter');
    }
    if (dto.formData.keperluan.length > 150) {
      throw new Error('Keperluan maksimal 150 karakter');
    }
    // Tidak boleh hanya berisi angka
    if (/^\d+$/.test(dto.formData.keperluan.trim())) {
      throw new Error('Keperluan tidak boleh hanya berisi angka');
    }

    // Validasi Judul Acara (optional, tapi jika diisi harus valid)
    if (dto.formData.judulAcara && dto.formData.judulAcara.trim() !== '') {
      if (dto.formData.judulAcara.trim().length < 5) {
        throw new Error('Judul acara minimal 5 karakter');
      }
      if (dto.formData.judulAcara.length > 150) {
        throw new Error('Judul acara maksimal 150 karakter');
      }
      // Tidak boleh hanya berisi angka
      if (/^\d+$/.test(dto.formData.judulAcara.trim())) {
        throw new Error('Judul acara tidak boleh hanya berisi angka');
      }
      // Tidak boleh ada enter/newline
      if (/[\r\n]/.test(dto.formData.judulAcara)) {
        throw new Error('Judul acara tidak boleh mengandung enter/baris baru');
      }
    }

    // Validasi Lokasi Acara (optional, tapi jika diisi harus valid)
    if (dto.formData.lokasiAcara && dto.formData.lokasiAcara.trim() !== '') {
      if (dto.formData.lokasiAcara.trim().length < 5) {
        throw new Error('Lokasi acara minimal 5 karakter');
      }
      if (dto.formData.lokasiAcara.length > 150) {
        throw new Error('Lokasi acara maksimal 150 karakter');
      }
      // Tidak boleh hanya berisi angka
      if (/^\d+$/.test(dto.formData.lokasiAcara.trim())) {
        throw new Error('Lokasi acara tidak boleh hanya berisi angka');
      }
      // Tidak boleh ada enter/newline
      if (/[\r\n]/.test(dto.formData.lokasiAcara)) {
        throw new Error('Lokasi acara tidak boleh mengandung enter/baris baru');
      }
    }

    // Get user's program studi to determine initial routing
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        mahasiswa: {
          include: {
            programStudi: true
          }
        },
        pegawai: {
          include: {
            programStudi: true
          }
        }
      }
    });

    const prodi = user?.mahasiswa?.programStudi || user?.pegawai?.programStudi;
    
    if (!prodi) {
      throw new Error('Program Studi tidak ditemukan untuk pengguna ini');
    }

    // Determine initial active role based on prodi configuration
    const initialActiveRole = prodi.hasKaprodi ? ROLES.KAPRODI : ROLES.KADEP;
    const routingMessage = prodi.hasKaprodi 
      ? 'Pengajuan berhasil dibuat dan diteruskan ke Ketua Program Studi untuk diverifikasi'
      : 'Pengajuan berhasil dibuat dan diteruskan ke Kepala Departemen untuk diverifikasi';

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
            currentActiveRole: initialActiveRole, // KAPRODI or KADEP based on prodi.hasKaprodi
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
        message: routingMessage,
        status: submission.status,
        currentActiveRole: initialActiveRole,
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

  /**
   * Stream attachment file directly from MinIO
   * Returns readable stream for proxying through backend
   */
  async streamAttachmentFile(attachmentId: string, letterInstanceId: string) {
    const attachment = await this.repository.getAttachmentById(attachmentId);
    if (!attachment || attachment.letterInstanceId !== letterInstanceId) {
      throw new Error('Lampiran tidak ditemukan');
    }

    if (!attachment.storagePath) {
      throw new Error('File tidak tersedia');
    }

    const stream = await this.minio.getFileStream(attachment.storagePath);

    return {
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      stream,
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
   * 
   * PENTING (SURAT HASIL):
   * - IF (Role saat ini ADA di daftar target tanda tangan) → canSignSuratHasil=true
   * - ELSE → canVerifySuratHasil=true
   * Target signature HANYA menentukan jenis tombol yang tampil!
   */
  private computePermissions(
    status: LetterStatus,
    viewerRole: string,
    currentActiveRole: string | null,
    createdById: string,
    rejectionReason?: string | null,
    documents?: Array<{ 
      type: string; 
      content?: unknown;
      signatures?: Array<{
        signerRole: string;
        signatureUrl?: string | null;
      }>;
    }>
  ): SubmissionPermissions {
    const isSubmitter = viewerRole === ROLES.MAHASISWA || viewerRole === ROLES.DOSEN;
    const isCompleted = status === 'COMPLETED';
    const isRejected = status === 'REJECTED' || status === 'CANCELLED';

    // Role-based checks
    const isKaprodi = viewerRole === ROLES.KETUA_PRODI;
    const isAdminProdi = viewerRole === ROLES.ADMIN_PRODI;
    const isKadep = viewerRole === ROLES.KETUA_DEPARTEMEN;
    const isAdminFakultas = viewerRole === ROLES.ADMIN_FAKULTAS;
    const isPejabat = [ROLES.DEKAN, ROLES.WAKIL_DEKAN_1, ROLES.WAKIL_DEKAN_2].includes(viewerRole as any);
    const isManajerTU = viewerRole === ROLES.MANAJER_TU;
    const isSupervisor = [ROLES.SUPERVISOR_AKADEMIK, ROLES.SUPERVISOR_SUMBER_DAYA].includes(viewerRole as any);
    const isStaf = [ROLES.STAF_AKADEMIK, ROLES.STAF_SUMBER_DAYA].includes(viewerRole as any);
    const isUPA = viewerRole === ROLES.UPA;
    
    // ====================================================================
    // VERIFICATION MODE DETECTION
    // True jika user sedang dalam mode verifikasi (fokus ke form data, bukan dokumen output)
    // ====================================================================
    // Kaprodi melakukan verifikasi FORM saat status SUBMITTED atau KAPRODI_REVIEW
    // Ini adalah mode dimana Kaprodi memeriksa data pengajuan, BUKAN dokumen
    const isKaprodiVerifyingForm = isKaprodi && ['SUBMITTED', 'KAPRODI_REVIEW'].includes(status);
    
    // isVerificationMode: Mode di mana user sedang memeriksa FORM pengajuan (bukan dokumen)
    // Hanya berlaku untuk tahap verifikasi awal, BUKAN saat signing
    const isVerificationMode = isKaprodiVerifyingForm;
    
    // ====================================================================
    // PRE-DRAFT MODE DETECTION  
    // True jika dokumen surat pengantar belum ada/belum digenerate
    // ====================================================================
    // Check if SURAT_PENGANTAR document exists and has content or file
    const suratPengantarDoc = documents?.find(d => d.type === 'SURAT_PENGANTAR');
    const hasSuratPengantarContent = !!suratPengantarDoc?.content;
    const hasSuratPengantarFile = !!(suratPengantarDoc as any)?.fileUrl;
    const isSuratPengantarDocReady = hasSuratPengantarContent || hasSuratPengantarFile;
    
    // Pre-draft mode: SEMUA ROLE jika dokumen belum ready dan status sudah melewati verifikasi
    // - Status SUBMITTED/KAPRODI_REVIEW: selalu pre-draft (belum ada proses drafting)
    // - Status SURAT_PENGANTAR_DRAFT: pre-draft jika dokumen belum ada content
    const isBeforeDrafting = ['SUBMITTED', 'KAPRODI_REVIEW'].includes(status);
    const isDraftingButNoContent = status === 'SURAT_PENGANTAR_DRAFT' && !isSuratPengantarDocReady;
    const isPreDraftMode = isBeforeDrafting || isDraftingButNoContent;

    // Status yang menandakan proses surat pengantar sudah dimulai
    const hasPengantarStatus = [
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
    
    // ====================================================================
    // RULE BARU: Dokumen TAMPILKAN jika sudah DRAFTED (file/content ada)
    // Visibility dokumen TIDAK bergantung pada status tanda tangan
    // Kunci: JIKA FILE SUDAH ADA (DRAFTED) -> TAMPILKAN
    // ====================================================================
    // showSuratPengantar logic:
    // 1. Status harus >= SURAT_PENGANTAR_DRAFT (proses sudah dimulai)
    // 2. **DOKUMEN HARUS BENAR-BENAR ADA** (content/file sudah di-generate)
    // 3. TIDAK dalam verification mode (verifikasi FORM awal oleh Kaprodi)
    //    KECUALI untuk pengaju (mahasiswa/dosen) yang selalu bisa lihat dokumen
    // 
    // CATATAN: Saat SURAT_PENGANTAR_REVIEW (menunggu TTD), dokumen TETAP DITAMPILKAN
    // karena dokumen sudah di-draft oleh Admin Prodi
    // PERBAIKAN: Mahasiswa/Dosen selalu bisa melihat surat pengantar jika dokumen sudah ada
    const showSuratPengantar = hasPengantarStatus && 
      isSuratPengantarDocReady && 
      (isSubmitter || !isVerificationMode);

    // Surat Hasil exists when status >= FAKULTAS_DRAFTING
    const hasFakultasStatus = [
      'FAKULTAS_DRAFTING',
      'FAKULTAS_VERIFICATION',
      'FAKULTAS_SIGNING',
      'UPA_NUMBERING',
      'UPA_STAMPING',
      'UPA_FINALIZING',
      'COMPLETED',
    ].includes(status);
    
    // Check if SK/ST document actually exists (has content or file)
    const suratHasilDoc = documents?.find(d => 
      d.type === 'SURAT_TUGAS' || d.type === 'SURAT_KEPUTUSAN' || d.type === 'SURAT_TUGAS_TABEL'
    );
    const hasSuratHasilContent = !!(suratHasilDoc?.content);
    const hasSuratHasilFile = !!(suratHasilDoc as any)?.fileUrl;
    const isSuratHasilDocReady = hasSuratHasilContent || hasSuratHasilFile;
    
    // PERBAIKAN: showSuratHasil = status >= FAKULTAS_DRAFTING DAN dokumen sudah ada
    // Untuk mahasiswa/dosen: tampilkan jika dokumen sudah ada
    const hasHasil = hasFakultasStatus && (isSubmitter ? isSuratHasilDocReady : true);

    // Kaprodi/Kadep can approve/reject when status is SUBMITTED and currentActiveRole matches
    const canApprove = status === 'SUBMITTED' && currentActiveRole !== null && 
      ((isKaprodi && currentActiveRole === 'KAPRODI') || 
       (isKadep && currentActiveRole === 'KADEP'));
    const canReject = status === 'SUBMITTED' && currentActiveRole !== null && 
      ((isKaprodi && currentActiveRole === 'KAPRODI') || 
       (isKadep && currentActiveRole === 'KADEP'));

    // Admin Prodi can draft when status is SURAT_PENGANTAR_DRAFT
    const canDraft = isAdminProdi && status === 'SURAT_PENGANTAR_DRAFT';
    const canSubmitDraft = isAdminProdi && status === 'SURAT_PENGANTAR_DRAFT';

    // Kaprodi/Kadep can sign when status is SURAT_PENGANTAR_REVIEW and it's their turn
    // Must check viewerRole matches the current active role to prevent showing button after signing
    const canSign = status === 'SURAT_PENGANTAR_REVIEW' && 
      currentActiveRole !== null &&
      ((isKaprodi && currentActiveRole === 'KAPRODI') || 
       (isKadep && currentActiveRole === 'KADEP'));

    // Faculty actions
    // Admin Fakultas can receive when surat pengantar is fully signed
    const canReceive = isAdminFakultas && status === 'SURAT_PENGANTAR_SIGNED' && currentActiveRole === 'ADMIN_FAKULTAS';
    // Admin Fakultas can forward after receiving (FAKULTAS_RECEIVED)
    const canForward = isAdminFakultas && status === 'FAKULTAS_RECEIVED' && currentActiveRole === 'ADMIN_FAKULTAS';
    
    // Pejabat can dispose when letter is assigned to them (FAKULTAS_DISPOSITION)
    // Note: Staf cannot dispose - they are at the bottom of hierarchy
    const canDispose = (isPejabat || isManajerTU || isSupervisor) && 
      status === 'FAKULTAS_DISPOSITION' && 
      currentActiveRole === viewerRole;
    
    // Pejabat/Supervisor/Staf can complete (finish processing at their level)
    const canComplete = (isPejabat || isManajerTU || isSupervisor || isStaf) && 
      status === 'FAKULTAS_DISPOSITION' && 
      currentActiveRole === viewerRole;
    
    // Pejabat/Supervisor/Staf can return to previous handler
    const canReturn = (isPejabat || isManajerTU || isSupervisor || isStaf) && 
      status === 'FAKULTAS_DISPOSITION' && 
      currentActiveRole === viewerRole;
    
    // Check if SK/ST draft exists (including table version)
    const hasSkstDraft = documents?.some(d => 
      d.type === 'SURAT_TUGAS' || d.type === 'SURAT_TUGAS_TABEL' || d.type === 'SURAT_KEPUTUSAN'
    );
    
    // Staf-specific actions for Surat Hasil
    // Staf can draft surat hasil when status is SURAT_DIBUAT or FAKULTAS_DRAFTING and assigned to them
    // PERBAIKAN: Include SURAT_DIBUAT (setelah disposisi ke staff)
    // Note: When pejabat dispositions to staf, status becomes SURAT_DIBUAT first
    // Only show "Draft Surat" if no SK/ST draft exists yet
    // Supervisor juga bisa draft jika menerima revisi dari Manajer TU
    const canDraftSuratHasil = (isStaf || isSupervisor) && 
      (status === 'SURAT_DIBUAT' || status === 'FAKULTAS_DRAFTING') && 
      currentActiveRole === viewerRole &&
      !hasSkstDraft;
    
    // Staf/Supervisor can edit draft when status is FAKULTAS_DRAFTING and assigned to them
    const canEditDraft = (isStaf || isSupervisor) && 
      status === 'FAKULTAS_DRAFTING' && 
      currentActiveRole === viewerRole &&
      hasSkstDraft;
    
    // Staf/Supervisor can submit for verification after drafting (only if draft exists)
    const canSubmitVerification = (isStaf || isSupervisor) && 
      status === 'FAKULTAS_DRAFTING' && 
      currentActiveRole === viewerRole &&
      hasSkstDraft;
    
    // Supervisor/Manajer TU/Pejabat can return for revision
    // - Saat VERIFICATION: Supervisor/Manajer TU/Pejabat bisa return ke role sebelumnya
    // - Saat DRAFTING (supervisor): bisa return ke staff
    // - Saat SIGNING: Pejabat (penandatangan) bisa return ke role sebelumnya
    const canReturnForRevision = 
      ((isSupervisor || isManajerTU) && status === 'FAKULTAS_VERIFICATION' && currentActiveRole === viewerRole) ||
      (isSupervisor && status === 'FAKULTAS_DRAFTING' && currentActiveRole === viewerRole && hasSkstDraft) ||
      (isPejabat && (status === 'FAKULTAS_VERIFICATION' || status === 'FAKULTAS_SIGNING') && currentActiveRole === viewerRole);
    
    // =====================================================================
    // SURAT HASIL: LOGIC TOMBOL VERIFIKASI vs TANDA TANGAN
    // Per dokumen: Target signature HANYA menentukan jenis tombol!
    // =====================================================================
    
    // Normalize role untuk perbandingan
    const normalizeRole = (role: string): string => {
      const ROLE_MAP: Record<string, string> = {
        'Dekan': 'DEKAN',
        'dekan': 'DEKAN',
        'Wakil Dekan I': 'WADEK_1',
        'Wakil Dekan 1': 'WADEK_1',
        'Wakil Dekan II': 'WADEK_2',
        'Wakil Dekan 2': 'WADEK_2',
        'DEKAN': 'DEKAN',
        'WADEK_1': 'WADEK_1',
        'WADEK_2': 'WADEK_2',
      };
      return ROLE_MAP[role] || role.toUpperCase().replace(/\s+/g, '_');
    };

    // Check if viewer's role is in the signature list (AND hasn't signed yet)
    const normalizedViewerRole = normalizeRole(viewerRole);
    const isViewerASigner = suratHasilDoc?.signatures?.some(
      sig => normalizeRole(sig.signerRole) === normalizedViewerRole && !sig.signatureUrl
    );

    // LOGIC SESUAI DOKUMEN:
    // - IF (Role saat ini ADA di daftar penandatangan) → canSignSuratHasil=true
    // - ELSE → canVerifySuratHasil=true
    
    // Pejabat verify surat hasil (HANYA jika BUKAN penandatangan)
    // Berlaku untuk: Supervisor, Manajer TU, Wadek, Dekan yang BUKAN di daftar TTD
    const canVerifySuratHasil = (isSupervisor || isManajerTU || isPejabat) && 
      (status === 'FAKULTAS_VERIFICATION' || status === 'FAKULTAS_SIGNING') && 
      currentActiveRole === viewerRole &&
      !isViewerASigner;
    
    // Pejabat sign surat hasil (HANYA jika ADA di daftar penandatangan)
    const canSignSuratHasil = isPejabat && 
      (status === 'FAKULTAS_VERIFICATION' || status === 'FAKULTAS_SIGNING') && 
      currentActiveRole === viewerRole &&
      isViewerASigner;
    
    const canVerify = isSupervisor && status === 'FAKULTAS_VERIFICATION';
    const canFinish = isStaf && status === 'FAKULTAS_DRAFTING';

    // UPA actions
    const canAssignNumber = isUPA && status === 'UPA_NUMBERING';
    const canStamp = isUPA && status === 'UPA_STAMPING';

    // Supervisor can edit draft during verification (Manajer TU cannot edit)
    const canEditDraftInVerification = isSupervisor && 
      status === 'FAKULTAS_VERIFICATION' && 
      currentActiveRole === viewerRole &&
      hasSkstDraft;

    return {
      canEdit: isSubmitter && this.canEditSubmission(status),
      canCancel: isSubmitter && this.canCancelSubmission(status),
      canDownload: isCompleted,
      canResubmit: isSubmitter && isRejected,
      showSuratPengantar,
      showSuratHasil: hasHasil,
      showFormulirAwal: true,
      showRiwayat: true,
      showAlasanDitolak: isRejected && !!rejectionReason,
      // UI Mode flags
      isVerificationMode,
      isPreDraftMode,
      // Department approval actions
      canApprove,
      canReject,
      canSign,
      canDraft,
      canSubmitDraft,
      // Faculty actions
      canReceive,
      canForward,
      canDispose,
      canComplete,
      canVerify,
      canReturn,
      canFinish,
      canAssignNumber,
      canStamp,
      // Surat Hasil permissions
      canDraftSuratHasil,
      canEditDraft,
      canEditDraftInVerification,
      canSubmitVerification,
      canVerifySuratHasil,
      canSignSuratHasil,
      canReturnForRevision,
    };
  }

  /**
   * Compute available return targets for a letter
   * 
   * PENTING: Untuk surat hasil (status FAKULTAS_*), return FLEKSIBEL
   * berdasarkan hierarki kategori, BUKAN berdasarkan history.
   * 
   * Untuk disposisi biasa (FAKULTAS_DISPOSITION):
   * 1. ADMIN_PRODI is ALWAYS the first/default target (dead end if selected)
   * 2. All faculty roles that have previously processed the letter are available
   * 3. The current role is excluded from the list
   * 
   * @param letterId - The letter instance ID
   * @param currentRole - The current viewer's role
   * @returns Array of role strings that can be return targets
   */
  private async computeReturnTargets(letterId: string, currentRole: string): Promise<string[]> {
    try {
      // Get the letter to check status and category
      const letter = await prisma.letterInstance.findUnique({
        where: { id: letterId },
        select: { 
          status: true, 
          category: true,
          letterType: { select: { category: true } }
        }
      });

      if (!letter) {
        return [ROLES.ADMIN_PRODI];
      }

      // For surat hasil status, use hierarchy-based return targets (FLEKSIBEL)
      const suratHasilStatuses = [
        'FAKULTAS_DRAFTING',
        'FAKULTAS_VERIFICATION', 
        'FAKULTAS_SIGNING'
      ];

      if (suratHasilStatuses.includes(letter.status)) {
        // Use getReturnTargets dari roles.ts untuk surat hasil
        const category = (letter.category || letter.letterType.category) as LetterCategory;
        
        // Normalize current role
        const normalizedRole = currentRole.toUpperCase().replace(/\s+/g, '_');
        
        return getReturnTargets(normalizedRole, category);
      }

      // For disposition status, use history-based targets
      const targets: string[] = [ROLES.ADMIN_PRODI];

      // Get all roles that have processed this letter at faculty level
      const historyActors = await facultyDispositionRepository.getDispositionHistoryActors(letterId);

      // Add all history actors except current role and ADMIN_PRODI (already added)
      for (const actor of historyActors) {
        if (actor === currentRole || actor === ROLES.ADMIN_PRODI) continue;
        if (!targets.includes(actor)) {
          targets.push(actor);
        }
      }

      return targets;
    } catch (error) {
      // If fetching fails, just return default target
      console.error('Failed to compute return targets:', error);
      return [ROLES.ADMIN_PRODI];
    }
  }
}

// Singleton instance
export const submissionService = new SubmissionService();
