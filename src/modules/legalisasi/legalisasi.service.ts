/**
 * Legalisasi Service
 * Business logic untuk modul UPA (penomoran, stempel, QR code, finalisasi)
 */

import QRCode from 'qrcode';
import { legalisasiRepository } from './legalisasi.repository';
import { LetterStatus, LegalisasiStatus, DocumentType } from '../../generated/prisma/client';
import { 
  encryptVerificationData, 
  generateVerificationUrl,
  decryptVerificationData 
} from '../../shared/utils/encryption';
import { 
  validateNomorFormat, 
  generateNomorSuggestion,
  getActionType,
  getDisplayStatus
} from './legalisasi.types';
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

// Default seal image URL (should be stored in MinIO/storage)
const DEFAULT_SEAL_URL = '/assets/seal/undip-fsm-seal.png';

// ============================================================================
// SERVICE CLASS
// ============================================================================

class LegalisasiService {
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
              letterType: existingDoc.letterInstance.letterType.name
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
   */
  async assignNomorSurat(
    input: { documentId: string; nomorSurat: string; tanggalSurat: Date },
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

      const result = await legalisasiRepository.assignNomorSurat(input, userId, userRole);

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
    input: { documentId: string; sealImageUrl?: string },
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

      // Use default seal if not provided
      const sealImageUrl = input.sealImageUrl || DEFAULT_SEAL_URL;

      const result = await legalisasiRepository.applyStempel(
        { documentId: input.documentId, sealImageUrl },
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

      // Build verification payload
      const payload = {
        id: document.id,
        no: document.nomorSurat,
        ttd: highestSigner.signerName,
        tgl: document.tanggalSurat?.toISOString() || new Date().toISOString(),
        jenis: document.type,
        perihal: document.perihal || undefined
      };

      // Encrypt payload
      const encryptedToken = encryptVerificationData(payload);
      
      // Generate verification URL
      const verificationUrl = generateVerificationUrl(encryptedToken);

      // Generate QR Code image
      const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
        errorCorrectionLevel: 'H',
        type: 'image/png',
        width: 200,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Extract base64 from data URL
      const qrCodeBase64 = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');

      // Save to database
      await legalisasiRepository.saveQRCode(
        {
          documentId,
          barcodeData: encryptedToken,
          qrCodeUrl: qrCodeDataUrl
        },
        userId,
        userRole
      );

      return {
        success: true,
        data: {
          qrCodeBase64,
          qrCodeDataUrl,
          encryptedToken,
          verificationUrl
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
   */
  async finalizeDocument(
    input: { documentId: string; fileUrl: string; notes?: string },
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

      const result = await legalisasiRepository.finalizeDocument(input, userId, userRole);

      // TODO: Send notification to tembusan recipients
      // await this.notifyTembusanRecipients(document.id);

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
   */
  async verifyDocument(token: string): Promise<ServiceResult<VerificationResult>> {
    try {
      // Decrypt token
      const decryptResult = decryptVerificationData(token);

      if (!decryptResult.success || !decryptResult.data) {
        return {
          success: true, // Return success but with invalid status
          data: {
            valid: false,
            status: 'INVALID_TOKEN',
            message: '❌ QR Code tidak valid atau telah dipalsukan. Dokumen ini mungkin PALSU!'
          }
        };
      }

      const payload = decryptResult.data;

      // Find document by ID
      const document = await legalisasiRepository.getDocumentForVerification(payload.id);

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

      // Verify nomor surat matches
      if (document.nomorSurat !== payload.no) {
        return {
          success: true,
          data: {
            valid: false,
            status: 'INVALID_TOKEN',
            message: '❌ Nomor surat tidak sesuai. Dokumen ini mungkin PALSU!'
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
}

export const legalisasiService = new LegalisasiService();
