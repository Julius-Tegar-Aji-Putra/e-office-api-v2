/**
 * Surat Hasil Repository
 * Data access layer untuk modul drafting SK/ST oleh staf
 */

import { prisma } from '../../db';
import { Prisma, LetterStatus, LogAction, DocumentType, LetterCategory } from '../../generated/prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface HasilListParams {
  page?: number;
  limit?: number;
  status?: LetterStatus;
  documentType?: DocumentType;
  search?: string;
}

export interface CreateDraftInput {
  letterInstanceId: string;
  documentType: DocumentType;
  content: Prisma.JsonValue;
  tembusan?: Prisma.JsonValue;
  perihal?: string;
  signatories: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string;
    order: number;
  }>;
}

export interface UpdateDraftInput {
  documentId: string;
  content?: Prisma.JsonValue;
  tembusan?: Prisma.JsonValue;
  perihal?: string;
}

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

class HasilRepository {
  /**
   * Get letters for staff drafting (status: FAKULTAS_DRAFTING)
   */
  async getLettersForDrafting(staffRole: string, params: HasilListParams) {
    const { page = 1, limit = 10, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.LetterInstanceWhereInput = {
      status: LetterStatus.FAKULTAS_DRAFTING,
      currentActiveRole: staffRole,
      ...(search && {
        OR: [
          { createdBy: { name: { contains: search, mode: 'insensitive' } } }
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
          documents: true,
          logs: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { actor: { select: { id: true, name: true } } }
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
   * Get drafted letters by staff (all outgoing letters they worked on)
   */
  async getDraftedLetters(staffUserId: string, params: HasilListParams) {
    const { page = 1, limit = 10, documentType } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.LetterInstanceWhereInput = {
      documents: {
        some: {
          type: { in: [DocumentType.SURAT_TUGAS, DocumentType.SURAT_KEPUTUSAN] }
        }
      },
      logs: {
        some: {
          actorId: staffUserId,
          action: { in: [LogAction.DRAFT_CREATE, LogAction.DRAFT_UPDATE] }
        }
      },
      ...(documentType && {
        documents: { some: { type: documentType } }
      })
    };

    const [data, total] = await Promise.all([
      prisma.letterInstance.findMany({
        where,
        include: {
          letterType: true,
          createdBy: { select: { id: true, name: true } },
          documents: {
            where: { type: { in: [DocumentType.SURAT_TUGAS, DocumentType.SURAT_KEPUTUSAN] } }
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
   * Get letter by ID with full details
   */
  async getLetterById(letterId: string) {
    return prisma.letterInstance.findUnique({
      where: { id: letterId },
      include: {
        letterType: {
          include: {
            templates: { where: { isActive: true }, take: 1 }
          }
        },
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
   * Create new SK/ST document
   */
  async createDraft(input: CreateDraftInput, actorId: string, actorRole: string) {
    const { letterInstanceId, documentType, content, tembusan, perihal, signatories } = input;

    return prisma.$transaction(async (tx) => {
      // Create document
      const document = await tx.letterDocument.create({
        data: {
          letterInstanceId,
          type: documentType,
          content: content as any,
          tembusan: (tembusan ?? []) as any,
          perihal
        }
      });

      // Create signature placeholders
      for (const sig of signatories) {
        await tx.documentSignature.create({
          data: {
            documentId: document.id,
            signerId: actorId,
            signerRole: sig.signerRole,
            signerName: sig.signerName,
            signerNip: sig.signerNip,
            order: sig.order
          }
        });
      }

      // Log
      await tx.letterLog.create({
        data: {
          letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.DRAFT_CREATE,
          notes: `Draft ${documentType === DocumentType.SURAT_TUGAS ? 'Surat Tugas' : 'Surat Keputusan'} dibuat`
        }
      });

      return document;
    });
  }

  /**
   * Update existing draft
   */
  async updateDraft(input: UpdateDraftInput, actorId: string, actorRole: string) {
    return prisma.$transaction(async (tx) => {
      const document = await tx.letterDocument.update({
        where: { id: input.documentId },
        data: {
          ...(input.content && { content: input.content }),
          ...(input.tembusan && { tembusan: input.tembusan }),
          ...(input.perihal && { perihal: input.perihal }),
          updatedAt: new Date()
        },
        include: { letterInstance: true }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.DRAFT_UPDATE,
          notes: 'Draft diperbarui'
        }
      });

      return document;
    });
  }

  /**
   * Submit draft for verification -> FAKULTAS_VERIFICATION
   */
  async submitForVerification(
    letterId: string,
    actorId: string,
    actorRole: string,
    category: LetterCategory
  ) {
    return prisma.$transaction(async (tx) => {
      // Determine next verifier based on category
      let nextRole: string;
      if (actorRole === 'STAF_AKADEMIK') {
        nextRole = 'SUPERVISOR_AKADEMIK';
      } else if (actorRole === 'STAF_SUMBER_DAYA') {
        nextRole = 'SUPERVISOR_SUMBER_DAYA';
      } else {
        // For UMUM, staff can choose
        nextRole = category === 'AKADEMIK' ? 'SUPERVISOR_AKADEMIK' : 'SUPERVISOR_SUMBER_DAYA';
      }

      const letter = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.FAKULTAS_VERIFICATION,
          currentActiveRole: nextRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.VERIFY,
          fromStatus: LetterStatus.FAKULTAS_DRAFTING,
          toStatus: LetterStatus.FAKULTAS_VERIFICATION,
          targetRole: nextRole,
          notes: 'Draft diajukan untuk verifikasi'
        }
      });

      return letter;
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
          include: { letterType: true }
        },
        signatures: { orderBy: { order: 'asc' } }
      }
    });
  }
}

export const hasilRepository = new HasilRepository();
