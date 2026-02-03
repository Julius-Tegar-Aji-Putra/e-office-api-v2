/**
 * Legalisasi Repository
 * Data access layer untuk modul UPA (penomoran, stempel, QR code, finalisasi)
 */

import { prisma } from '../../db';
import { 
  Prisma, 
  LetterStatus, 
  LogAction, 
  DocumentType,
  LegalisasiStatus 
} from '../../generated/prisma/client';
import type { UpaQueueFilter, UsedNumberRecord } from './legalisasi.types';

// ============================================================================
// TYPES
// ============================================================================

export interface AssignNumberInput {
  documentId: string;
  nomorSurat: string;
  tanggalSurat: Date;
  fileUrl?: string; // Generated PDF URL with nomor surat embedded
}

export interface ApplyStempelInput {
  documentId: string;
  sealImageUrl: string;
  fileUrl?: string; // Generated PDF URL with stempel embedded
}

export interface GenerateQRInput {
  documentId: string;
  barcodeData: string;
  qrCodeUrl: string;
  fileUrl?: string; // Generated PDF URL with QR code embedded
}

export interface FinalizeInput {
  documentId: string;
  fileUrl: string;
  notes?: string;
}

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

class LegalisasiRepository {
  /**
   * Get UPA processing queue
   */
  async getUPAQueue(params: UpaQueueFilter) {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      legalisasiStatus,
      kategori,
      search 
    } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.LetterInstanceWhereInput = {
      // Filter letters in UPA stages OR completed
      status: status ?? {
        in: [
          LetterStatus.UPA_NUMBERING,
          LetterStatus.UPA_STAMPING,
          LetterStatus.UPA_FINALIZING,
          LetterStatus.COMPLETED
        ]
      },
      // Only show letters that have reached UPA
      currentActiveRole: status === LetterStatus.COMPLETED ? undefined : 'UPA',
      // Filter by category if specified
      ...(kategori && { letterType: { category: kategori } }),
      // Search filter
      ...(search && {
        OR: [
          { createdBy: { name: { contains: search, mode: 'insensitive' } } },
          { documents: { some: { nomorSurat: { contains: search } } } },
          { documents: { some: { perihal: { contains: search, mode: 'insensitive' } } } }
        ]
      }),
      // Legalisasi status filter on documents
      ...(legalisasiStatus && {
        documents: { some: { legalisasiStatus } }
      })
    };

    const [data, total] = await Promise.all([
      prisma.letterInstance.findMany({
        where,
        include: {
          letterType: true,
          createdBy: {
            include: {
              mahasiswa: { include: { programStudi: true } },
              pegawai: { include: { programStudi: true } }
            }
          },
          documents: {
            where: { 
              type: { in: [DocumentType.SURAT_TUGAS, DocumentType.SURAT_KEPUTUSAN] } 
            },
            include: { 
              signatures: { 
                orderBy: { order: 'asc' },
                where: { status: 'SIGNED' }
              } 
            }
          }
        },
        orderBy: [
          { status: 'asc' }, // UPA_NUMBERING first
          { updatedAt: 'desc' }
        ],
        skip,
        take: limit
      }),
      prisma.letterInstance.count({ where })
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get letter by ID with full details
   */
  async getLetterById(letterId: string) {
    return prisma.letterInstance.findUnique({
      where: { id: letterId },
      include: {
        letterType: true,
        createdBy: {
          include: {
            mahasiswa: { include: { programStudi: true, departemen: true } },
            pegawai: { include: { programStudi: true, departemen: true } }
          }
        },
        documents: {
          include: { 
            signatures: { orderBy: { order: 'asc' } } 
          }
        },
        attachments: true,
        logs: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });
  }

  /**
   * Get document by ID
   */
  async getDocumentById(documentId: string) {
    return prisma.letterDocument.findUnique({
      where: { id: documentId },
      include: {
        letterInstance: {
          include: {
            letterType: true,
            createdBy: {
              include: {
                mahasiswa: { include: { programStudi: true, departemen: true } },
                pegawai: { include: { programStudi: true, departemen: true } }
              }
            }
          }
        },
        signatures: { 
          orderBy: { order: 'asc' },
          include: { signer: { select: { id: true, name: true, email: true } } }
        }
      }
    });
  }

  /**
   * Check if nomor surat already exists
   */
  async checkNomorSuratExists(nomorSurat: string, excludeDocId?: string): Promise<boolean> {
    const existing = await prisma.letterDocument.findFirst({
      where: {
        nomorSurat,
        ...(excludeDocId && { id: { not: excludeDocId } })
      }
    });
    return !!existing;
  }

  /**
   * Get existing document by nomor surat
   */
  async getDocumentByNomorSurat(nomorSurat: string) {
    return prisma.letterDocument.findFirst({
      where: { nomorSurat },
      include: {
        letterInstance: {
          include: { letterType: true }
        }
      }
    });
  }

  /**
   * Get used nomor surat list with pagination
   */
  async getUsedNumbers(params: { 
    page?: number; 
    limit?: number; 
    year?: number;
    search?: string;
  }): Promise<{ data: UsedNumberRecord[]; total: number; page: number; limit: number; totalPages: number }> {
    const { page = 1, limit = 20, year, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.LetterDocumentWhereInput = {
      nomorSurat: { not: null },
      ...(year && {
        tanggalSurat: {
          gte: new Date(`${year}-01-01`),
          lte: new Date(`${year}-12-31`)
        }
      }),
      ...(search && {
        OR: [
          { nomorSurat: { contains: search } },
          { perihal: { contains: search, mode: 'insensitive' } }
        ]
      })
    };

    const [documents, total] = await Promise.all([
      prisma.letterDocument.findMany({
        where,
        select: {
          nomorSurat: true,
          tanggalSurat: true,
          perihal: true,
          createdAt: true,
          letterInstance: {
            select: {
              letterType: { select: { name: true } }
            }
          }
        },
        orderBy: { tanggalSurat: 'desc' },
        skip,
        take: limit
      }),
      prisma.letterDocument.count({ where })
    ]);

    const data: UsedNumberRecord[] = documents.map(doc => ({
      nomorSurat: doc.nomorSurat!,
      tanggalSurat: doc.tanggalSurat,
      perihal: doc.perihal,
      letterType: doc.letterInstance.letterType.name,
      createdAt: doc.createdAt
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get last nomor surat for suggestion
   */
  async getLastNomorSurat(): Promise<string | null> {
    const lastDoc = await prisma.letterDocument.findFirst({
      where: { nomorSurat: { not: null } },
      orderBy: { tanggalSurat: 'desc' },
      select: { nomorSurat: true }
    });
    return lastDoc?.nomorSurat ?? null;
  }

  /**
   * Assign nomor surat to document
   */
  async assignNomorSurat(
    input: AssignNumberInput,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Get document with letter instance
      const document = await tx.letterDocument.findUnique({
        where: { id: input.documentId },
        include: { letterInstance: true }
      });

      if (!document) throw new Error('Document not found');

      // Update document with nomor surat and new PDF URL
      const updatedDoc = await tx.letterDocument.update({
        where: { id: input.documentId },
        data: {
          nomorSurat: input.nomorSurat,
          tanggalSurat: input.tanggalSurat,
          legalisasiStatus: LegalisasiStatus.NOMOR_DIBERIKAN,
          ...(input.fileUrl && { fileUrl: input.fileUrl }),
          updatedAt: new Date()
        },
        include: { 
          letterInstance: true,
          signatures: { orderBy: { order: 'asc' } }
        }
      });

      // Update letter instance status to STAMPING
      await tx.letterInstance.update({
        where: { id: document.letterInstanceId },
        data: {
          status: LetterStatus.UPA_STAMPING,
          updatedAt: new Date()
        }
      });

      // Log action
      await tx.letterLog.create({
        data: {
          letterInstanceId: document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.ASSIGN_NUMBER,
          fromStatus: LetterStatus.UPA_NUMBERING,
          toStatus: LetterStatus.UPA_STAMPING,
          notes: `Nomor surat: ${input.nomorSurat}`,
          metadata: { 
            nomorSurat: input.nomorSurat, 
            tanggalSurat: input.tanggalSurat.toISOString() 
          }
        }
      });

      return updatedDoc;
    });
  }

  /**
   * Apply stempel to document
   */
  async applyStempel(
    input: ApplyStempelInput,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      const document = await tx.letterDocument.findUnique({
        where: { id: input.documentId },
        include: { letterInstance: true }
      });

      if (!document) throw new Error('Document not found');

      // Update document with seal and new PDF URL
      const updatedDoc = await tx.letterDocument.update({
        where: { id: input.documentId },
        data: {
          sealImageUrl: input.sealImageUrl,
          legalisasiStatus: LegalisasiStatus.STEMPEL_DIBERIKAN,
          ...(input.fileUrl && { fileUrl: input.fileUrl }),
          updatedAt: new Date()
        },
        include: { 
          letterInstance: true,
          signatures: { orderBy: { order: 'asc' } }
        }
      });

      // Update letter instance status to FINALIZING
      await tx.letterInstance.update({
        where: { id: document.letterInstanceId },
        data: {
          status: LetterStatus.UPA_FINALIZING,
          updatedAt: new Date()
        }
      });

      // Log action
      await tx.letterLog.create({
        data: {
          letterInstanceId: document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.STAMP,
          fromStatus: LetterStatus.UPA_STAMPING,
          toStatus: LetterStatus.UPA_FINALIZING,
          notes: 'Stempel resmi telah dibubuhkan',
          metadata: { sealImageUrl: input.sealImageUrl }
        }
      });

      return updatedDoc;
    });
  }

  /**
   * Save QR code data to document
   * UPDATED: Save verificationToken untuk short URL
   */
  async saveQRCode(
    input: GenerateQRInput & { verificationToken?: string },
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      const document = await tx.letterDocument.findUnique({
        where: { id: input.documentId },
        include: { letterInstance: true }
      });

      if (!document) throw new Error('Document not found');

      // Update document with QR data and new PDF URL
      const updatedDoc = await tx.letterDocument.update({
        where: { id: input.documentId },
        data: {
          barcodeData: input.barcodeData,
          qrCodeUrl: input.qrCodeUrl,
          verificationToken: input.verificationToken, // NEW: Save short token
          legalisasiStatus: LegalisasiStatus.QR_GENERATED,
          ...(input.fileUrl && { fileUrl: input.fileUrl }),
          updatedAt: new Date()
        },
        include: { 
          letterInstance: true,
          signatures: { orderBy: { order: 'asc' } }
        }
      });

      // Log action
      await tx.letterLog.create({
        data: {
          letterInstanceId: document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.GENERATE_QR,
          fromStatus: document.letterInstance.status,
          toStatus: document.letterInstance.status,
          notes: `QR Code verifikasi telah di-generate (token: ${input.verificationToken})`,
          metadata: { qrCodeUrl: input.qrCodeUrl, verificationToken: input.verificationToken }
        }
      });

      return updatedDoc;
    });
  }

  /**
   * Finalize document (mark as COMPLETED)
   */
  async finalizeDocument(
    input: FinalizeInput,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      const document = await tx.letterDocument.findUnique({
        where: { id: input.documentId },
        include: { 
          letterInstance: true,
          signatures: true
        }
      });

      if (!document) throw new Error('Document not found');

      // Update document
      const updatedDoc = await tx.letterDocument.update({
        where: { id: input.documentId },
        data: {
          fileUrl: input.fileUrl,
          legalisasiStatus: LegalisasiStatus.COMPLETED,
          readyToDistribute: true,
          updatedAt: new Date()
        },
        include: {
          letterInstance: true,
          signatures: { orderBy: { order: 'asc' } }
        }
      });

      // Update letter instance to COMPLETED
      const letter = await tx.letterInstance.update({
        where: { id: document.letterInstanceId },
        data: {
          status: LetterStatus.COMPLETED,
          currentActiveRole: null,
          completedAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Log action
      await tx.letterLog.create({
        data: {
          letterInstanceId: document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.FINALIZE,
          fromStatus: LetterStatus.UPA_FINALIZING,
          toStatus: LetterStatus.COMPLETED,
          notes: input.notes || 'Surat telah selesai diproses dan siap didistribusikan',
          metadata: { fileUrl: input.fileUrl }
        }
      });

      return { document: updatedDoc, letter };
    });
  }

  /**
   * Get document by verification token (barcodeData)
   */
  async getDocumentByBarcodeData(barcodeData: string) {
    return prisma.letterDocument.findFirst({
      where: { barcodeData },
      include: {
        letterInstance: {
          include: {
            letterType: true,
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
  }

  /**
   * Get document by ID (for public verification)
   */
  async getDocumentForVerification(documentId: string) {
    return prisma.letterDocument.findUnique({
      where: { id: documentId },
      include: {
        letterInstance: {
          include: {
            letterType: true,
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
  }

  /**
   * Get tembusan recipients
   */
  async getTembusanRecipients(documentId: string) {
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId },
      select: { tembusan: true }
    });

    if (!document?.tembusan) return [];

    // Tembusan bisa berupa array of IDs atau array of objects
    const tembusanData = document.tembusan as unknown[];
    
    // If it's array of IDs
    if (typeof tembusanData[0] === 'string') {
      return prisma.user.findMany({
        where: { id: { in: tembusanData as string[] } },
        select: { id: true, name: true, email: true }
      });
    }

    // If it's already array of objects
    return tembusanData;
  }
}

export const legalisasiRepository = new LegalisasiRepository();
