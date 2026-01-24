/**
 * Legalisasi Repository
 * Data access layer untuk modul UPA (penomoran, stempel, finalisasi)
 */

import { prisma } from '../../db';
import { Prisma, LetterStatus, LogAction, DocumentType } from '../../generated/prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface LegalisasiListParams {
  page?: number;
  limit?: number;
  status?: LetterStatus;
  search?: string;
}

export interface AssignNumberInput {
  documentId: string;
  nomorSurat: string;
  tanggalSurat: Date;
}

export interface FinalizeInput {
  documentId: string;
  qrCodeUrl: string;
  fileUrl: string;
}

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

class LegalisasiRepository {
  /**
   * Get letters for UPA processing
   */
  async getLettersForUPA(params: LegalisasiListParams) {
    const { page = 1, limit = 10, status, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.LetterInstanceWhereInput = {
      status: status ?? {
        in: [
          LetterStatus.UPA_NUMBERING,
          LetterStatus.UPA_STAMPING,
          LetterStatus.UPA_FINALIZING
        ]
      },
      currentActiveRole: 'UPA',
      ...(search && {
        OR: [
          { createdBy: { name: { contains: search, mode: 'insensitive' } } },
          { documents: { some: { nomorSurat: { contains: search } } } }
        ]
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
            where: { type: { in: [DocumentType.SURAT_TUGAS, DocumentType.SURAT_KEPUTUSAN] } },
            include: { signatures: { orderBy: { order: 'asc' } } }
          }
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.letterInstance.count({ where })
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get letter by ID
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
          include: { signatures: { orderBy: { order: 'asc' } } }
        },
        attachments: true,
        logs: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' }
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
   * Get recent nomor surat for reference
   */
  async getRecentNomorSurat(documentType: DocumentType, limit: number = 10) {
    return prisma.letterDocument.findMany({
      where: {
        type: documentType,
        nomorSurat: { not: null }
      },
      select: {
        nomorSurat: true,
        tanggalSurat: true,
        letterInstance: {
          select: {
            letterType: { select: { name: true, code: true } }
          }
        }
      },
      orderBy: { tanggalSurat: 'desc' },
      take: limit
    });
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
      const document = await tx.letterDocument.update({
        where: { id: input.documentId },
        data: {
          nomorSurat: input.nomorSurat,
          tanggalSurat: input.tanggalSurat,
          updatedAt: new Date()
        },
        include: { letterInstance: true }
      });

      // Update letter status to STAMPING
      await tx.letterInstance.update({
        where: { id: document.letterInstanceId },
        data: {
          status: LetterStatus.UPA_STAMPING,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.ASSIGN_NUMBER,
          fromStatus: LetterStatus.UPA_NUMBERING,
          toStatus: LetterStatus.UPA_STAMPING,
          notes: `Nomor surat: ${input.nomorSurat}`,
          metadata: { nomorSurat: input.nomorSurat, tanggalSurat: input.tanggalSurat }
        }
      });

      return document;
    });
  }

  /**
   * Apply stamp to document
   */
  async applyStamp(documentId: string, actorId: string, actorRole: string) {
    return prisma.$transaction(async (tx) => {
      const document = await tx.letterDocument.findUnique({
        where: { id: documentId },
        include: { letterInstance: true }
      });

      if (!document) throw new Error('Document not found');

      // Update letter status to FINALIZING
      await tx.letterInstance.update({
        where: { id: document.letterInstanceId },
        data: {
          status: LetterStatus.UPA_FINALIZING,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.STAMP,
          fromStatus: LetterStatus.UPA_STAMPING,
          toStatus: LetterStatus.UPA_FINALIZING,
          notes: 'Stempel resmi telah dibubuhkan'
        }
      });

      return document;
    });
  }

  /**
   * Finalize document (generate QR, PDF, mark complete)
   */
  async finalizeDocument(
    input: FinalizeInput,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      const document = await tx.letterDocument.update({
        where: { id: input.documentId },
        data: {
          qrCodeUrl: input.qrCodeUrl,
          fileUrl: input.fileUrl,
          updatedAt: new Date()
        },
        include: {
          letterInstance: true,
          signatures: true
        }
      });

      // Mark letter as COMPLETED
      const letter = await tx.letterInstance.update({
        where: { id: document.letterInstanceId },
        data: {
          status: LetterStatus.COMPLETED,
          currentActiveRole: null,
          completedAt: new Date(),
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.FINALIZE,
          fromStatus: LetterStatus.UPA_FINALIZING,
          toStatus: LetterStatus.COMPLETED,
          notes: 'Surat telah selesai diproses dan siap didistribusikan',
          metadata: { fileUrl: input.fileUrl, qrCodeUrl: input.qrCodeUrl }
        }
      });

      return { document, letter };
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
            createdBy: true
          }
        },
        signatures: { orderBy: { order: 'asc' } }
      }
    });
  }

  /**
   * Get tembusan recipients for distribution
   */
  async getTembusanRecipients(documentId: string) {
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId },
      select: { tembusan: true }
    });

    if (!document?.tembusan) return [];

    const tembusanIds = document.tembusan as string[];
    
    return prisma.user.findMany({
      where: { id: { in: tembusanIds } },
      select: {
        id: true,
        name: true,
        email: true
      }
    });
  }
}

export const legalisasiRepository = new LegalisasiRepository();
