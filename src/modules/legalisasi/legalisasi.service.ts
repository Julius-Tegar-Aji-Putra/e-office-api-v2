/**
 * Legalisasi Service
 * Business logic untuk modul UPA (penomoran, stempel, QR code, finalisasi)
 */

import { prisma } from '../../db';
import { legalisasiRepository } from './legalisasi.repository';
import { LetterStatus, LegalisasiStatus, DocumentType } from '../../generated/prisma/client';
import {
  validateNomorFormat,
  generateNomorSuggestion,
  getActionType,
  getDisplayStatus
} from './legalisasi.types';
import { distributionService } from '../../shared/services/distribution.service';
import { minioService, MinioService } from '../../shared/services/minio.service';
import { legalisasiPdfService } from './legalisasi-pdf.service';
import type {
  UpaQueueFilter,
  UpaDashboardItem,
  LegalisasiDetail,
  QRCodeResult,
  VerificationResult,
  LegalisasiPermissions
} from './legalisasi.types';

// ============================================================================
// TYPES
// ============================================================================

export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: number;
}

export interface PdfResult {
  success: boolean;
  data?: Buffer;
  filename?: string;
  error?: string;
  code?: number;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class LegalisasiService {
  private minio: MinioService;

  constructor() {
    this.minio = minioService;
  }

  /**
   * Get UPA queue with transformed data
   */
  async getUPAQueue(
    params: UpaQueueFilter,
    userId: string,
    userRole: string
  ): Promise<ServiceResult<{ data: UpaDashboardItem[]; total: number; page: number; limit: number; totalPages: number }>> {
    try {
      // Check if user has UPA role
      if (userRole !== 'UPA' && userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
        return {
          success: false,
          error: 'Access denied. Only UPA staff can access this queue',
          code: 403
        };
      }

      const result = await legalisasiRepository.getUPAQueue(params);

      // Transform to dashboard items
      const transformedData: UpaDashboardItem[] = result.data.map(letter => {
        const document = letter.documents[0]; // Get main document (ST/SK)
        const mahasiswa = letter.createdBy.mahasiswa;
        const pegawai = letter.createdBy.pegawai;

        return {
          id: letter.id,
          documentId: document?.id ?? '',
          judulSurat: document?.perihal || (letter.submissionValues as any)?.perihal || 'Tidak ada perihal',
          nomorSurat: document?.nomorSurat || null,
          tipeSurat: document?.type || DocumentType.SURAT_TUGAS,
          kategoriSurat: letter.letterType.category,
          tanggalMasuk: letter.updatedAt,
          status: letter.status,
          legalisasiStatus: document?.legalisasiStatus || LegalisasiStatus.PENDING,
          displayStatus: getDisplayStatus(
            letter.status,
            document?.legalisasiStatus || LegalisasiStatus.PENDING
          ),
          needsAction: letter.status !== LetterStatus.COMPLETED,
          actionType: getActionType(
            letter.status,
            document?.legalisasiStatus || LegalisasiStatus.PENDING
          ),
          pemohon: {
            id: letter.createdBy.id,
            name: letter.createdBy.name,
            nim: mahasiswa?.nim,
            prodi: mahasiswa?.programStudi?.name || pegawai?.programStudi?.name
          },
          signatures: document?.signatures?.map(sig => ({
            signerName: sig.signerName,
            signerRole: sig.signerRole,
            prefix: sig.prefix || null,
            signedAt: sig.signedAt,
            status: sig.status
          })) || []
        };
      });

      return {
        success: true,
        data: {
          data: transformedData,
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages
        }
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
   * Get letter detail for UPA processing
   */
  async getLetterDetail(
    letterId: string,
    userId: string,
    userRole: string
  ): Promise<ServiceResult<LegalisasiDetail>> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      const letter = await legalisasiRepository.getLetterById(letterId);

      if (!letter) {
        return { success: false, error: 'Letter not found', code: 404 };
      }

      // Get main document (ST/SK)
      const document = letter.documents.find(d =>
        d.type === DocumentType.SURAT_TUGAS || d.type === DocumentType.SURAT_KEPUTUSAN
      );

      if (!document) {
        return { success: false, error: 'Main document not found', code: 404 };
      }

      // Get last nomor surat for suggestion
      const lastNomor = await legalisasiRepository.getLastNomorSurat();
      const nomorSuggestion = generateNomorSuggestion(lastNomor);

      // Build permissions
      const permissions = this.buildPermissions(letter.status, document.legalisasiStatus);

      // Get tembusan
      const tembusan = await legalisasiRepository.getTembusanRecipients(document.id);

      const mahasiswa = letter.createdBy.mahasiswa;
      const pegawai = letter.createdBy.pegawai;

      const detail: LegalisasiDetail = {
        letterInstance: {
          id: letter.id,
          status: letter.status,
          letterCategory: letter.letterType.category,
          submissionValues: letter.submissionValues,
          createdAt: letter.createdAt,
          createdBy: {
            id: letter.createdBy.id,
            name: letter.createdBy.name,
            nim: mahasiswa?.nim,
            email: letter.createdBy.email,
            prodi: mahasiswa?.programStudi?.name || pegawai?.programStudi?.name,
            departemen: mahasiswa?.departemen?.name || pegawai?.departemen?.name
          },
          letterType: {
            id: letter.letterType.id,
            name: letter.letterType.name,
            code: letter.letterType.code
          }
        },
        document: {
          id: document.id,
          type: document.type,
          perihal: document.perihal,
          nomorSurat: document.nomorSurat,
          tanggalSurat: document.tanggalSurat,
          fileUrl: document.fileUrl,
          legalisasiStatus: document.legalisasiStatus,
          sealImageUrl: document.sealImageUrl,
          barcodeData: document.barcodeData,
          qrCodeUrl: document.qrCodeUrl,
          readyToDistribute: document.readyToDistribute,
          signatures: document.signatures.map(sig => ({
            id: sig.id,
            signerId: sig.signerId,
            signerName: sig.signerName,
            signerRole: sig.signerRole,
            signerNip: sig.signerNip,
            prefix: sig.prefix || null,
            signatureUrl: sig.signatureUrl,
            status: sig.status,
            signedAt: sig.signedAt,
            order: sig.order
          }))
        },
        tembusan: Array.isArray(tembusan) ? tembusan.map((t: any) => ({
          name: t.name || t,
          email: t.email,
          unit: t.unit
        })) : [],
        permissions,
        nomorSuggestion
      };

      return { success: true, data: detail };
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
   * Check if nomor surat is available
   */
  async checkNomorSurat(
    nomorSurat: string,
    userId: string,
    userRole: string
  ): Promise<ServiceResult<{ isAvailable: boolean; existingDocument?: any; suggestion?: string }>> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      // Validate format first
      const formatValidation = validateNomorFormat(nomorSurat);
      if (!formatValidation.valid) {
        return {
          success: false,
          error: formatValidation.error,
          code: 400
        };
      }

      // Check if exists
      const existingDoc = await legalisasiRepository.getDocumentByNomorSurat(nomorSurat);

      if (existingDoc) {
        return {
          success: true,
          data: {
            isAvailable: false,
            existingDocument: {
              perihal: existingDoc.perihal,
              tanggalSurat: existingDoc.tanggalSurat?.toISOString(),
              letterType: (existingDoc as any).letterInstance?.letterType?.name
            }
          }
        };
      }

      // Get suggestion for next number
      const lastNomor = await legalisasiRepository.getLastNomorSurat();
      const suggestion = generateNomorSuggestion(lastNomor);

      return {
        success: true,
        data: {
          isAvailable: true,
          suggestion
        }
      };
    } catch (error) {
      console.error('Error checking nomor surat:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check nomor surat',
        code: 500
      };
    }
  }

  /**
   * Get list of used nomor surat
   */
  async getUsedNumbers(
    params: { page?: number; limit?: number; year?: number; search?: string },
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      const result = await legalisasiRepository.getUsedNumbers(params);
      return { success: true, data: result };
    } catch (error) {
      console.error('Error getting used numbers:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get used numbers',
        code: 500
      };
    }
  }

  /**
   * Assign nomor surat to document
   * Supports optional position data for PDF overlay
   */
  async assignNomorSurat(
    input: {
      documentId: string;
      nomorSurat: string;
      tanggalSurat: Date;
      position?: {
        x: number;
        y: number;
        page: number;
        fontSize: number;
      };
    },
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      // Get document and validate status
      const document = await legalisasiRepository.getDocumentById(input.documentId);
      if (!document) {
        return { success: false, error: 'Document not found', code: 404 };
      }

      if (document.letterInstance.status !== LetterStatus.UPA_NUMBERING) {
        return {
          success: false,
          error: `Cannot assign number. Current status: ${document.letterInstance.status}`,
          code: 400
        };
      }

      // Validate format
      const formatValidation = validateNomorFormat(input.nomorSurat);
      if (!formatValidation.valid) {
        return { success: false, error: formatValidation.error, code: 400 };
      }

      // Check for duplicates
      const isDuplicate = await legalisasiRepository.checkNomorSuratExists(
        input.nomorSurat,
        input.documentId
      );
      if (isDuplicate) {
        return {
          success: false,
          error: 'Nomor surat sudah digunakan. Silakan gunakan nomor lain.',
          code: 409
        };
      }

      // Hanya update DB - frontend preview auto-update via template rendering
      // PDF final akan di-generate oleh frontend saat finalisasi
      const result = await legalisasiRepository.assignNomorSurat(
        input,
        userId,
        userRole
      );

      return {
        success: true,
        data: result
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
   * Apply stempel to document
   */
  async applyStempel(
    input: { documentId: string; sealImageUrl?: string; sealTargetRole?: string },
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      const document = await legalisasiRepository.getDocumentById(input.documentId);
      if (!document) {
        return { success: false, error: 'Document not found', code: 404 };
      }

      if (document.letterInstance.status !== LetterStatus.UPA_STAMPING) {
        return {
          success: false,
          error: `Cannot apply stamp. Current status: ${document.letterInstance.status}`,
          code: 400
        };
      }

      // Hanya update DB - frontend preview auto-update via template rendering
      // PDF final akan di-generate oleh frontend saat finalisasi
      const result = await legalisasiRepository.applyStempel(
        {
          documentId: input.documentId,
          sealImageUrl: 'local:stempel.png', // Use local stempel from public folder
          sealTargetRole: input.sealTargetRole, // Role pejabat yang dipilih UPA
        },
        userId,
        userRole
      );

      return { success: true, data: result };
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
   * Generate QR Code for document verification
   */
  async generateQRCode(
    documentId: string,
    userId: string,
    userRole: string
  ): Promise<ServiceResult<QRCodeResult>> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
        return { success: false, error: 'Access denied', code: 403 };
      }

      const document = await legalisasiRepository.getDocumentById(documentId);
      if (!document) {
        return { success: false, error: 'Document not found', code: 404 };
      }

      if (document.letterInstance.status !== LetterStatus.UPA_FINALIZING) {
        return {
          success: false,
          error: `Cannot generate QR. Current status: ${document.letterInstance.status}`,
          code: 400
        };
      }

      // Validate document has required data
      if (!document.nomorSurat) {
        return { success: false, error: 'Nomor surat belum diberikan', code: 400 };
      }

      // Get highest signer (last in order)
      const highestSigner = document.signatures
        .filter(s => s.status === 'SIGNED')
        .sort((a, b) => b.order - a.order)[0];

      if (!highestSigner) {
        return { success: false, error: 'Tidak ada penandatangan', code: 400 };
      }

      // Generate QR Code (token + QR image) - tanpa regenerate PDF
      // PDF final akan di-generate oleh frontend saat finalisasi
      let qrResult;
      try {
        qrResult = await legalisasiPdfService.generateVerificationQRCode(documentId);
        console.log(`QR Code generated. Short token: ${qrResult.shortToken}`);
      } catch (qrError) {
        console.error('Error generating QR Code:', qrError);
        return {
          success: false,
          error: `Gagal generate QR Code: ${qrError instanceof Error ? qrError.message : 'Unknown error'}`,
          code: 500
        };
      }

      // Save QR data to database and create log entry
      await legalisasiRepository.saveQRCode(
        {
          documentId,
          barcodeData: qrResult.shortToken,
          qrCodeUrl: qrResult.qrCodeDataUrl,
          verificationToken: qrResult.shortToken
        },
        userId,
        userRole
      );

      return {
        success: true,
        data: {
          qrCodeBase64: qrResult.qrCodeBase64,
          qrCodeDataUrl: qrResult.qrCodeDataUrl,
          encryptedToken: qrResult.shortToken,
          verificationUrl: qrResult.verificationUrl
        }
      };
    } catch (error) {
      console.error('Error generating QR code:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate QR code',
        code: 500
      };
    }
  }

  /**
   * Finalize document (complete legalisasi process)
   * Menerima PDF blob dari frontend, upload ke MinIO, lalu finalize
   */
  async finalizeDocument(
    input: { documentId: string; fileUrl?: string; notes?: string; pdfBuffer?: Buffer },
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
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

      // Validate all requirements
      if (!document.nomorSurat) {
        return { success: false, error: 'Nomor surat belum diberikan', code: 400 };
      }

      if (!document.sealImageUrl) {
        return { success: false, error: 'Stempel belum dibubuhkan', code: 400 };
      }

      if (!document.barcodeData || !document.qrCodeUrl) {
        return { success: false, error: 'QR Code belum di-generate', code: 400 };
      }

      // Upload PDF dari frontend ke MinIO jika ada
      let finalFileUrl = input.fileUrl || document.fileUrl || '';
      if (input.pdfBuffer) {
        try {
          finalFileUrl = await legalisasiPdfService.uploadPdf(
            input.pdfBuffer,
            `surat_${input.documentId}_final.pdf`
          );
          console.log(`[Legalisasi] Final PDF uploaded to MinIO: ${finalFileUrl}`);
        } catch (uploadError) {
          console.error('Error uploading final PDF:', uploadError);
          return {
            success: false,
            error: `Gagal upload PDF final: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
            code: 500
          };
        }
      }

      const result = await legalisasiRepository.finalizeDocument(
        { documentId: input.documentId, fileUrl: finalFileUrl, notes: input.notes },
        userId,
        userRole
      );

      // Distribute to tembusan recipients (internal system, bukan email)
      try {
        const tembusanData = document.tembusan;
        const recipients = distributionService.parseTembusanData(tembusanData);

        if (recipients.length > 0) {
          // Resolve recipients (convert role-based to user IDs if needed)
          const mahasiswa = document.letterInstance.createdBy.mahasiswa;
          const resolvedRecipients = await distributionService.resolveRecipients(recipients, {
            departemenId: mahasiswa?.departemenId,
            programStudiId: mahasiswa?.programStudiId,
          });

          // Distribute document to recipients
          const distributeResult = await distributionService.distributeDocument({
            documentId: input.documentId,
            letterInstanceId: document.letterInstanceId,
            recipients: resolvedRecipients,
            distributedBy: {
              userId,
              role: userRole,
            },
          });

          console.log(`Document distributed: ${distributeResult.distributed} success, ${distributeResult.failed} failed`);
        }
      } catch (distError) {
        // Log error but don't fail the finalization
        console.error('Error distributing to tembusan:', distError);
      }

      return { success: true, data: result };
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
   * Verify document from QR code token (PUBLIC - no auth required)
   * UPDATED: Menggunakan short token lookup dari database
   */
  async verifyDocument(token: string): Promise<ServiceResult<VerificationResult>> {
    try {
      // Validate token format
      if (!token || token.length < 8 || token.length > 12) {
        return {
          success: true, // Return success but with invalid status
          data: {
            valid: false,
            status: 'INVALID_TOKEN',
            message: '❌ Format QR Code tidak valid. Dokumen ini mungkin PALSU!'
          }
        };
      }

      // Find document by verification token (short token)
      const document = await prisma.letterDocument.findUnique({
        where: { verificationToken: token },
        include: {
          letterInstance: {
            include: {
              createdBy: {
                include: {
                  mahasiswa: true,
                  pegawai: true
                }
              }
            }
          },
          signatures: {
            where: { status: 'SIGNED' },
            orderBy: { order: 'asc' }
          }
        }
      });

      if (!document) {
        return {
          success: true,
          data: {
            valid: false,
            status: 'NOT_FOUND',
            message: '❌ Dokumen tidak ditemukan dalam sistem. Dokumen ini mungkin PALSU!'
          }
        };
      }

      // Document is verified
      const mahasiswa = document.letterInstance.createdBy.mahasiswa;
      const pegawai = document.letterInstance.createdBy.pegawai;

      return {
        success: true,
        data: {
          valid: true,
          status: 'VERIFIED',
          message: '✅ DOKUMEN ASLI - Terdaftar di Sistem E-Office Fakultas Sains dan Matematika UNDIP',
          data: {
            nomorSurat: document.nomorSurat!,
            tanggalSurat: document.tanggalSurat?.toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            }) || '-',
            perihal: document.perihal || '-',
            jenisDocument: document.type === 'SURAT_TUGAS' ? 'Surat Tugas' : 'Surat Keputusan',
            penandatangan: document.signatures.map(sig => ({
              nama: sig.signerName,
              jabatan: sig.signerRole
            })),
            pemohon: {
              nama: document.letterInstance.createdBy.name,
              nim: mahasiswa?.nim
            },
            dibuatPada: document.letterInstance.createdAt.toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })
          }
        }
      };
    } catch (error) {
      console.error('Error verifying document:', error);
      return {
        success: true,
        data: {
          valid: false,
          status: 'INVALID_TOKEN',
          message: '❌ Terjadi kesalahan saat verifikasi. Silakan coba lagi.'
        }
      };
    }
  }

  /**
   * Get tembusan recipients
   */
  async getTembusanRecipients(
    documentId: string,
    userId: string,
    userRole: string
  ): Promise<ServiceResult> {
    try {
      if (userRole !== 'UPA' && userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
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

  /**
   * Build permissions based on status
   */
  private buildPermissions(
    letterStatus: LetterStatus,
    legalisasiStatus: LegalisasiStatus
  ): LegalisasiPermissions {
    return {
      canPenomoran: letterStatus === LetterStatus.UPA_NUMBERING,
      canStempel: letterStatus === LetterStatus.UPA_STAMPING,
      canGenerateQR: letterStatus === LetterStatus.UPA_FINALIZING &&
        legalisasiStatus === LegalisasiStatus.STEMPEL_DIBERIKAN,
      canFinalize: letterStatus === LetterStatus.UPA_FINALIZING &&
        legalisasiStatus === LegalisasiStatus.QR_GENERATED,
      showPenomoranForm: letterStatus === LetterStatus.UPA_NUMBERING,
      showStempelButton: letterStatus === LetterStatus.UPA_STAMPING,
      showQRButton: letterStatus === LetterStatus.UPA_FINALIZING &&
        legalisasiStatus === LegalisasiStatus.STEMPEL_DIBERIKAN,
      showFinalizeButton: letterStatus === LetterStatus.UPA_FINALIZING &&
        legalisasiStatus === LegalisasiStatus.QR_GENERATED
    };
  }

  /**
   * Get PDF document for download/preview (bypasses signed URL issues)
   */
  async getDocumentPdf(
    documentId: string,
    userId: string,
    userRole: string
  ): Promise<PdfResult> {
    try {
      // Get document with related data
      const document = await legalisasiRepository.getDocumentById(documentId);

      if (!document) {
        return { success: false, error: 'Document not found', code: 404 };
      }

      // Any authenticated user can view the PDF of a completed/signed document.
      // The document is already accessible to all roles who participated in the flow
      // (submitter, admin prodi, admin fakultas, dekan, wadek, kadep, kaprodi, UPA).
      // No extra role restriction needed — authentication alone is sufficient.

      // Get file URL from database
      const fileUrl = document.fileUrl;
      if (!fileUrl) {
        return { success: false, error: 'No PDF file available for this document', code: 404 };
      }

      console.log('[LegalisasiService.getDocumentPdf] Fetching PDF:', { documentId, fileUrl });

      // If fileUrl is a storage path (not http), download from MinIO
      let pdfBuffer: Buffer;

      if (fileUrl.startsWith('http')) {
        // It's a signed URL - fetch via HTTP
        const response = await fetch(fileUrl);
        if (!response.ok) {
          console.error('[LegalisasiService.getDocumentPdf] Failed to fetch from URL:', response.status);
          return { success: false, error: 'Failed to fetch PDF from storage', code: 500 };
        }
        pdfBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        // It's a storage path - download directly from MinIO
        try {
          pdfBuffer = await this.minio.downloadFile(fileUrl);
        } catch (err) {
          console.error('[LegalisasiService.getDocumentPdf] MinIO error:', err);
          return { success: false, error: 'Storage error', code: 500 };
        }
      }

      // Generate filename
      const nomorSurat = document.nomorSurat || 'document';
      const safeFilename = nomorSurat.replace(/[\/\\?%*:|"<>]/g, '-') + '.pdf';

      console.log('[LegalisasiService.getDocumentPdf] Success, returning buffer of', pdfBuffer.length, 'bytes');

      return {
        success: true,
        data: pdfBuffer,
        filename: safeFilename
      };
    } catch (error) {
      console.error('[LegalisasiService.getDocumentPdf] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 500
      };
    }
  }
}

export const legalisasiService = new LegalisasiService();
