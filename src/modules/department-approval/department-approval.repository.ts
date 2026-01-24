/**
 * Department Approval Repository
 * Data access layer untuk modul department approval (Lingkup Departemen)
 * Handles: Kaprodi approval, Admin Prodi drafting surat pengantar, TTD flow
 */

import { prisma } from '../../db';
import { Prisma, LetterStatus, LogAction, DocumentType } from '../../generated/prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface DepartmentApprovalListParams {
  page?: number;
  limit?: number;
  status?: LetterStatus;
  search?: string;
}

export interface CreateDepartmentApprovalDraftInput {
  letterInstanceId: string;
  content: Prisma.JsonValue;
  tembusan?: Prisma.JsonValue;
  signatories: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string;
    order: number;
  }>;
}

export interface LogInput {
  letterInstanceId: string;
  actorId: string;
  actorRole: string;
  action: LogAction;
  fromStatus?: LetterStatus;
  toStatus?: LetterStatus;
  targetRole?: string;
  notes?: string;
  metadata?: Prisma.JsonValue;
}

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

class DepartmentApprovalRepository {
  /**
   * Get letters pending Kaprodi approval (status: SUBMITTED)
   */
  async getLettersForKaprodiApproval(
    kaprodiUserId: string,
    params: DepartmentApprovalListParams
  ) {
    const { page = 1, limit = 10, search } = params;
    const skip = (page - 1) * limit;

    // Get departemen/prodi from kaprodi's pegawai profile
    const kaprodi = await prisma.pegawai.findUnique({
      where: { userId: kaprodiUserId },
      select: { programStudiId: true, departemenId: true }
    });

    if (!kaprodi) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    const where: Prisma.LetterInstanceWhereInput = {
      status: LetterStatus.SUBMITTED,
      currentActiveRole: 'KAPRODI',
      createdBy: {
        OR: [
          { mahasiswa: { programStudiId: kaprodi.programStudiId } },
          { pegawai: { programStudiId: kaprodi.programStudiId } }
        ]
      },
      ...(search && {
        OR: [
          { submissionValues: { path: ['keperluan'], string_contains: search } },
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
          logs: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.letterInstance.count({ where })
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get letters pending Admin Prodi drafting (status: SURAT_PENGANTAR_DRAFT)
   */
  async getLettersForAdminProdiDraft(
    adminProdiUserId: string,
    params: DepartmentApprovalListParams
  ) {
    const { page = 1, limit = 10, search } = params;
    const skip = (page - 1) * limit;

    const adminProdi = await prisma.pegawai.findUnique({
      where: { userId: adminProdiUserId },
      select: { programStudiId: true, departemenId: true }
    });

    if (!adminProdi) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    const where: Prisma.LetterInstanceWhereInput = {
      status: LetterStatus.SURAT_PENGANTAR_DRAFT,
      currentActiveRole: 'ADMIN_PRODI',
      createdBy: {
        OR: [
          { mahasiswa: { programStudiId: adminProdi.programStudiId } },
          { pegawai: { programStudiId: adminProdi.programStudiId } }
        ]
      }
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
            where: { type: DocumentType.SURAT_PENGANTAR }
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
   * Get letters pending signature (status: SURAT_PENGANTAR_REVIEW)
   */
  async getLettersForSignature(
    signerUserId: string,
    signerRole: string,
    params: DepartmentApprovalListParams
  ) {
    const { page = 1, limit = 10 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.LetterInstanceWhereInput = {
      status: LetterStatus.SURAT_PENGANTAR_REVIEW,
      currentActiveRole: signerRole,
      documents: {
        some: {
          type: DocumentType.SURAT_PENGANTAR,
          signatures: {
            some: {
              signerRole: signerRole,
              signatureUrl: null // Belum ditandatangani
            }
          }
        }
      }
    };

    const [data, total] = await Promise.all([
      prisma.letterInstance.findMany({
        where,
        include: {
          letterType: true,
          createdBy: {
            include: {
              mahasiswa: { include: { programStudi: true } },
              pegawai: true
            }
          },
          documents: {
            where: { type: DocumentType.SURAT_PENGANTAR },
            include: { signatures: true }
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
   * Get letter instance by ID with full details
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
            mahasiswa: {
              include: { programStudi: true, departemen: true }
            },
            pegawai: {
              include: { programStudi: true, departemen: true }
            }
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
   * Kaprodi approves submission -> status: SURAT_PENGANTAR_DRAFT
   */
  async approveSubmission(
    letterId: string,
    actorId: string,
    actorRole: string,
    notes?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.SURAT_PENGANTAR_DRAFT,
          currentActiveRole: 'ADMIN_PRODI',
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.APPROVE,
          fromStatus: LetterStatus.SUBMITTED,
          toStatus: LetterStatus.SURAT_PENGANTAR_DRAFT,
          targetRole: 'ADMIN_PRODI',
          notes
        }
      });

      return letter;
    });
  }

  /**
   * Kaprodi rejects submission -> status: REJECTED
   */
  async rejectSubmission(
    letterId: string,
    actorId: string,
    actorRole: string,
    reason: string
  ) {
    return prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.REJECTED,
          currentActiveRole: null,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.REJECT,
          fromStatus: LetterStatus.SUBMITTED,
          toStatus: LetterStatus.REJECTED,
          notes: reason,
          metadata: { rejectionReason: reason }
        }
      });

      return letter;
    });
  }

  /**
   * Admin Prodi creates/updates surat pengantar draft
   */
  async savePengantarDraft(
    input: CreateDepartmentApprovalDraftInput,
    actorId: string,
    actorRole: string
  ) {
    const { letterInstanceId, content, tembusan, signatories } = input;

    return prisma.$transaction(async (tx) => {
      // Upsert document
      const document = await tx.letterDocument.upsert({
        where: {
          letterInstanceId_type: {
            letterInstanceId,
            type: DocumentType.SURAT_PENGANTAR
          }
        },
        create: {
          letterInstanceId,
          type: DocumentType.SURAT_PENGANTAR,
          content: content as any,
          tembusan: (tembusan ?? []) as any
        },
        update: {
          content: content as any,
          tembusan: (tembusan ?? []) as any,
          updatedAt: new Date()
        }
      });

      // Delete existing signatures and recreate
      await tx.documentSignature.deleteMany({
        where: { documentId: document.id }
      });

      // Create signature placeholders
      for (const sig of signatories) {
        await tx.documentSignature.create({
          data: {
            documentId: document.id,
            signerId: actorId, // Will be updated when actual signer signs
            signerRole: sig.signerRole,
            signerName: sig.signerName,
            signerNip: sig.signerNip,
            order: sig.order
          }
        });
      }

      // Log the action
      await tx.letterLog.create({
        data: {
          letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.DRAFT_UPDATE,
          notes: 'Draft surat pengantar disimpan'
        }
      });

      return document;
    });
  }

  /**
   * Admin Prodi submits draft for signature -> status: SURAT_PENGANTAR_REVIEW
   */
  async submitDraftForSignature(
    letterId: string,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Get first signatory (usually KAPRODI)
      const document = await tx.letterDocument.findFirst({
        where: {
          letterInstanceId: letterId,
          type: DocumentType.SURAT_PENGANTAR
        },
        include: {
          signatures: { orderBy: { order: 'asc' }, take: 1 }
        }
      });

      const firstSignerRole = document?.signatures[0]?.signerRole ?? 'KAPRODI';

      const letter = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.SURAT_PENGANTAR_REVIEW,
          currentActiveRole: firstSignerRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.DRAFT_CREATE,
          fromStatus: LetterStatus.SURAT_PENGANTAR_DRAFT,
          toStatus: LetterStatus.SURAT_PENGANTAR_REVIEW,
          targetRole: firstSignerRole,
          notes: 'Draft surat pengantar diajukan untuk ditandatangani'
        }
      });

      return letter;
    });
  }

  /**
   * Sign surat pengantar (Kaprodi/Kadep)
   */
  async signPengantar(
    letterId: string,
    actorId: string,
    actorRole: string,
    signatureUrl: string,
    signerName: string,
    signerNip?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Get document and signatures
      const document = await tx.letterDocument.findFirst({
        where: {
          letterInstanceId: letterId,
          type: DocumentType.SURAT_PENGANTAR
        },
        include: {
          signatures: { orderBy: { order: 'asc' } }
        }
      });

      if (!document) {
        throw new Error('Document not found');
      }

      // Update signature
      const currentSig = document.signatures.find(s => s.signerRole === actorRole);
      if (currentSig) {
        await tx.documentSignature.update({
          where: { id: currentSig.id },
          data: {
            signerId: actorId,
            signerName,
            signerNip,
            signatureUrl,
            signedAt: new Date()
          }
        });
      }

      // Check next signer
      const currentIndex = document.signatures.findIndex(s => s.signerRole === actorRole);
      const nextSigner = document.signatures[currentIndex + 1];

      let newStatus: LetterStatus;
      let nextRole: string | null;

      if (nextSigner && !nextSigner.signatureUrl) {
        // More signatures needed
        newStatus = LetterStatus.SURAT_PENGANTAR_REVIEW;
        nextRole = nextSigner.signerRole;
      } else {
        // All signed -> move to fakultas
        newStatus = LetterStatus.SURAT_PENGANTAR_SIGNED;
        nextRole = 'ADMIN_FAKULTAS';

        // Mark document as signed
        await tx.letterDocument.update({
          where: { id: document.id },
          data: { isSigned: true }
        });
      }

      const letter = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: newStatus,
          currentActiveRole: nextRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.SIGN,
          fromStatus: LetterStatus.SURAT_PENGANTAR_REVIEW,
          toStatus: newStatus,
          targetRole: nextRole,
          notes: `Ditandatangani oleh ${signerName} (${actorRole})`
        }
      });

      return letter;
    });
  }

  /**
   * Create log entry
   */
  async createLog(input: LogInput) {
    return prisma.letterLog.create({
      data: {
        letterInstanceId: input.letterInstanceId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        targetRole: input.targetRole,
        notes: input.notes,
        metadata: input.metadata as any
      }
    });
  }
}

export const departmentApprovalRepository = new DepartmentApprovalRepository();
