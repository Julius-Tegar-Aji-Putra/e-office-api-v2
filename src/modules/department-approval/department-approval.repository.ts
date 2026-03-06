/**
 * Department Approval Repository
 * Data access layer untuk modul department approval (Lingkup Departemen)
 * Handles: Kaprodi approval, Admin Prodi drafting surat pengantar, TTD flow
 */

import { prisma } from '../../db';
import { Prisma, LetterStatus, LogAction, DocumentType, SignatureType } from '../../generated/prisma/client';
import { formatRoleForLog } from '../../shared/constants/roles';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize signer role to uppercase constant format
 * Handles both display text (e.g., "Dekan") and role constants (e.g., "DEKAN")
 */
const SIGNER_ROLE_NORMALIZATION: Record<string, string> = {
  'Dekan': 'DEKAN',
  'dekan': 'DEKAN',
  'Wakil Dekan I': 'WADEK_1',
  'Wakil Dekan 1': 'WADEK_1',
  'wakil dekan i': 'WADEK_1',
  'Wakil Dekan II': 'WADEK_2',
  'Wakil Dekan 2': 'WADEK_2',
  'wakil dekan ii': 'WADEK_2',
  'Ketua Departemen': 'KADEP',
  'ketua departemen': 'KADEP',
  'Ketua Program Studi': 'KAPRODI',
  'Ketua Prodi': 'KAPRODI',
  'ketua prodi': 'KAPRODI',
  // Already in constant format
  'DEKAN': 'DEKAN',
  'WADEK_1': 'WADEK_1',
  'WADEK_2': 'WADEK_2',
  'KADEP': 'KADEP',
  'KAPRODI': 'KAPRODI',
};

function normalizeSignerRole(role: string): string {
  return SIGNER_ROLE_NORMALIZATION[role] || role.toUpperCase().replace(/\s+/g, '_');
}

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
    prefix?: string; // Awalan tanda tangan, e.g., "Mengetahui,", "Menyetujui,"
    order: number;
    // Position data for signature placement on PDF
    x?: number;
    y?: number;
    page?: number;
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
          { documents: { some: { perihal: { contains: search, mode: 'insensitive' } } } },
          { submissionValues: { path: ['judulAcara'], string_contains: search } },
          { documents: { some: { nomorSurat: { contains: search, mode: 'insensitive' } } } },
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
   * Get letters pending Kadep approval (status: SUBMITTED)
   * For prodi WITHOUT Kaprodi (hasKaprodi=false)
   */
  async getLettersForKadepApproval(
    kadepUserId: string,
    params: DepartmentApprovalListParams
  ) {
    const { page = 1, limit = 10, search } = params;
    const skip = (page - 1) * limit;

    // Get departemen from kadep's pegawai profile
    const kadep = await prisma.pegawai.findUnique({
      where: { userId: kadepUserId },
      select: { departemenId: true }
    });

    if (!kadep) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    const where: Prisma.LetterInstanceWhereInput = {
      status: LetterStatus.SUBMITTED,
      currentActiveRole: 'KADEP',
      createdBy: {
        OR: [
          { mahasiswa: { departemenId: kadep.departemenId } },
          { pegawai: { departemenId: kadep.departemenId } }
        ]
      },
      ...(search && {
        OR: [
          { documents: { some: { perihal: { contains: search, mode: 'insensitive' } } } },
          { submissionValues: { path: ['judulAcara'], string_contains: search } },
          { documents: { some: { nomorSurat: { contains: search, mode: 'insensitive' } } } },
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
   * Filtered by signer's programStudiId for KAPRODI, or departemenId for KADEP
   */
  async getLettersForSignature(
    signerUserId: string,
    signerRole: string,
    params: DepartmentApprovalListParams
  ) {
    const { page = 1, limit = 10 } = params;
    const skip = (page - 1) * limit;

    // Get signer's program studi or departemen
    const signer = await prisma.pegawai.findUnique({
      where: { userId: signerUserId },
      select: { programStudiId: true, departemenId: true }
    });

    if (!signer) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    const where: Prisma.LetterInstanceWhereInput = {
      status: LetterStatus.SURAT_PENGANTAR_REVIEW,
      currentActiveRole: signerRole,
      // Filter by programStudi for KAPRODI, by departemen for KADEP
      createdBy: signerRole === 'KAPRODI' ? {
        OR: [
          { mahasiswa: { programStudiId: signer.programStudiId } },
          { pegawai: { programStudiId: signer.programStudiId } }
        ]
      } : {
        OR: [
          { mahasiswa: { departemenId: signer.departemenId } },
          { pegawai: { departemenId: signer.departemenId } }
        ]
      },
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
   * Admin Prodi creates initial surat pengantar draft
   */
  async createInitialDraft(
    input: CreateDepartmentApprovalDraftInput,
    actorId: string,
    actorRole: string
  ) {
    const { letterInstanceId, content, tembusan, signatories } = input;

    return prisma.$transaction(async (tx) => {
      // Create document
      const document = await tx.letterDocument.create({
        data: {
          letterInstanceId,
          type: DocumentType.SURAT_PENGANTAR,
          content: content as any,
          tembusan: (tembusan ?? []) as any
        }
      });

      // Create signature placeholders with position data
      for (const sig of signatories) {
        await tx.documentSignature.create({
          data: {
            documentId: document.id,
            signerId: actorId, // Will be updated when actual signer signs
            signerRole: normalizeSignerRole(sig.signerRole),
            signerName: sig.signerName,
            signerNip: sig.signerNip,
            prefix: sig.prefix,
            order: sig.order,
            positionX: sig.x,
            positionY: sig.y,
            positionPage: sig.page
          }
        });
      }

      // Log the action
      await tx.letterLog.create({
        data: {
          letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.DRAFT_CREATE,
          notes: 'Surat pengantar dibuat'
        }
      });

      return document;
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

    // Extract nomorSurat, tanggalSurat, perihal from content to store in separate columns
    const contentObj = content as Record<string, unknown> || {};
    const nomorSurat = contentObj.nomorSurat as string || null;
    const tanggalSurat = contentObj.tanggalSurat ? new Date(contentObj.tanggalSurat as string) : null;
    const perihal = contentObj.perihal as string || null;

    return prisma.$transaction(async (tx) => {
      // Upsert document - include nomorSurat, tanggalSurat, perihal in separate columns
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
          tembusan: (tembusan ?? []) as any,
          nomorSurat: nomorSurat,
          tanggalSurat: tanggalSurat,
          perihal: perihal,
        },
        update: {
          content: content as any,
          tembusan: (tembusan ?? []) as any,
          nomorSurat: nomorSurat,
          tanggalSurat: tanggalSurat,
          perihal: perihal,
          // Reset signed state when Admin Prodi re-drafts (e.g. after letter returned from Faculty)
          isSigned: false,
          fileUrl: null,
          updatedAt: new Date()
        }
      });

      // Delete existing signatures and recreate
      await tx.documentSignature.deleteMany({
        where: { documentId: document.id }
      });

      // Create signature placeholders with position data
      for (const sig of signatories) {
        await tx.documentSignature.create({
          data: {
            documentId: document.id,
            signerId: actorId, // Will be updated when actual signer signs
            signerRole: normalizeSignerRole(sig.signerRole),
            signerName: sig.signerName,
            signerNip: sig.signerNip,
            prefix: sig.prefix,
            order: sig.order,
            positionX: sig.x,
            positionY: sig.y,
            positionPage: sig.page
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
    signerNip?: string,
    saveSignature: boolean = false
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

      // Find current signer's index
      const currentIndex = document.signatures.findIndex(s => s.signerRole === actorRole);
      if (currentIndex === -1) {
        throw new Error('Anda tidak terdaftar sebagai penandatangan surat ini');
      }

      // PENTING: Cek apakah semua signature sebelumnya sudah ditandatangani
      // Kaprodi harus ttd dulu sebelum Kadep bisa ttd
      for (let i = 0; i < currentIndex; i++) {
        const prevSigner = document.signatures[i];
        if (!prevSigner.signatureUrl || !prevSigner.signedAt) {
          throw new Error(`${prevSigner.signerRole} harus menandatangani terlebih dahulu sebelum Anda`);
        }
      }

      // Update signature
      const currentSig = document.signatures[currentIndex];
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
          notes: `Ditandatangani oleh ${signerName} (${formatRoleForLog(actorRole)})`
        }
      });

      // Save signature if requested
      if (saveSignature && signatureUrl) {
        // Determine signature type based on format
        const signatureType = signatureUrl.startsWith('data:')
          ? SignatureType.HANDWRITING
          : SignatureType.UPLOAD;

        try {
          // Create new saved signature for user
          await tx.savedSignature.create({
            data: {
              userId: actorId,
              fileUrl: signatureUrl,
              fileName: `TTD-${actorRole}-${Date.now()}`,
              alias: `TTD ${signerName || actorRole}`,
              type: signatureType
            }
          });
        } catch (err) {
          // Log error but don't fail the signing process
          console.error('Failed to save signature:', err);
        }
      }

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
