/**
 * Faculty Approval Repository
 * Data access layer untuk modul verifikasi & tanda tangan pejabat fakultas
 */

import { prisma } from '../../db';
import { Prisma, LetterStatus, LogAction, DocumentType, LetterCategory, SignatureStatus } from '../../generated/prisma/client';
import { formatRoleForLog } from '../../shared/constants/roles';

// ============================================================================
// TYPES
// ============================================================================

export interface FacultyApprovalListParams {
  page?: number;
  limit?: number;
  status?: LetterStatus;
  category?: LetterCategory;
  search?: string;
}

export interface VerifyInput {
  letterId: string;
  notes?: string;
  nextTargets?: string[]; // For UMUM category multi-select at Manajer TU
}

export interface SignInput {
  letterId: string;
  signatureData?: string;  // base64 from canvas/upload
  signatureUrl?: string;   // URL from saved signature
  signerName?: string;
  signerNip?: string;
  notes?: string;
  saveSignature?: boolean;
}

export interface ReturnInput {
  letterId: string;
  targetRole: string;
  targetUserId?: string;
  reason: string;
}

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

class FacultyApprovalRepository {
  /**
   * Get letters for verification/signing (status: FAKULTAS_VERIFICATION or FAKULTAS_SIGNING)
   */
  async getLettersForVerification(userRole: string, params: FacultyApprovalListParams) {
    const { page = 1, limit = 10, category, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.LetterInstanceWhereInput = {
      status: {
        in: [LetterStatus.FAKULTAS_VERIFICATION, LetterStatus.FAKULTAS_SIGNING]
      },
      currentActiveRole: userRole,
      ...(category && {
        letterType: { category }
      }),
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
          documents: {
            where: { type: { in: [DocumentType.SURAT_TUGAS, DocumentType.SURAT_KEPUTUSAN] } },
            include: { signatures: { orderBy: { order: 'asc' } } }
          },
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
   * Verify document and move to next level
   */
  async verifyDocument(
    input: VerifyInput,
    actorId: string,
    actorRole: string,
    nextRole: string,
    nextStatus: LetterStatus | string
  ) {
    return prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.update({
        where: { id: input.letterId },
        data: {
          status: nextStatus as LetterStatus,
          currentActiveRole: nextRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: input.letterId,
          actorId,
          actorRole,
          action: LogAction.VERIFY,
          fromStatus: LetterStatus.FAKULTAS_VERIFICATION,
          toStatus: nextStatus as LetterStatus,
          targetRole: nextRole,
          notes: input.notes || `Diverifikasi oleh ${formatRoleForLog(actorRole)}`,
          metadata: input.nextTargets ? { nextTargets: input.nextTargets } as any : undefined
        }
      });

      return letter;
    });
  }

  /**
   * Sign document
   */
  async signDocument(
    input: SignInput,
    actorId: string,
    actorRole: string,
    nextRole: string | null,
    nextStatus: LetterStatus
  ) {
    return prisma.$transaction(async (tx) => {
      // Get the SK/ST document
      const letter = await tx.letterInstance.findUnique({
        where: { id: input.letterId },
        include: {
          documents: {
            where: { type: { in: [DocumentType.SURAT_TUGAS, DocumentType.SURAT_KEPUTUSAN] } },
            include: { signatures: { orderBy: { order: 'asc' } } }
          }
        }
      });

      if (!letter || !letter.documents[0]) {
        throw new Error('Document not found');
      }

      const document = letter.documents[0];

      // Find and update signature
      const currentSig = document.signatures.find(s => s.signerRole === actorRole);
      if (currentSig) {
        await tx.documentSignature.update({
          where: { id: currentSig.id },
          data: {
            signerId: actorId,
            signerName: input.signerName,
            signerNip: input.signerNip,
            signatureUrl: input.signatureUrl,
            signedAt: new Date()
          }
        });
      }

      // Check if all signatures complete
      const allSigned = document.signatures.every(
        s => s.signatureUrl || s.signerRole === actorRole
      );

      if (allSigned && nextStatus === LetterStatus.UPA_NUMBERING) {
        // Mark document as signed
        await tx.letterDocument.update({
          where: { id: document.id },
          data: { isSigned: true }
        });
      }

      // Update letter status
      const updatedLetter = await tx.letterInstance.update({
        where: { id: input.letterId },
        data: {
          status: nextStatus,
          currentActiveRole: nextRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: input.letterId,
          actorId,
          actorRole,
          action: LogAction.SIGN,
          fromStatus: letter.status,
          toStatus: nextStatus,
          targetRole: nextRole,
          notes: input.notes || `Ditandatangani oleh ${input.signerName}`
        }
      });

      return updatedLetter;
    });
  }

  /**
   * Return document to lower role
   * 
   * PENTING: Saat surat dikembalikan, tanda tangan dari role yang level
   * hierarkinya >= targetRole akan dihapus (perlu diulangi).
   * 
   * Contoh UMUM:
   * - Dekan return ke Wadek 1 → clear TTD Wadek 1
   * - Dekan return ke Wadek 2 → clear TTD Wadek 2 + Wadek 1
   * - Wadek 1 return ke Wadek 2 → clear TTD Wadek 2
   */
  async returnDocument(
    input: ReturnInput,
    actorId: string,
    actorRole: string,
    rolesToClearSignatures: string[] = [],
    statusOverride?: LetterStatus
  ) {
    return prisma.$transaction(async (tx) => {
      // Determine new status
      let newStatus: LetterStatus;
      if (statusOverride) {
        newStatus = statusOverride;
      } else if (['STAF_AKADEMIK', 'STAF_SUMBER_DAYA'].includes(input.targetRole)) {
        newStatus = LetterStatus.FAKULTAS_DRAFTING;
      } else {
        newStatus = LetterStatus.FAKULTAS_VERIFICATION;
      }

      const isStafTarget = ['STAF_AKADEMIK', 'STAF_SUMBER_DAYA'].includes(input.targetRole);

      // ====================================================================
      // Clear signatures dari role yang perlu mengulang tanda tangan
      // ====================================================================
      if (rolesToClearSignatures.length > 0) {
        // Get all SK/ST documents for this letter
        const documents = await tx.letterDocument.findMany({
          where: {
            letterInstanceId: input.letterId,
            type: { in: [DocumentType.SURAT_TUGAS, DocumentType.SURAT_TUGAS_TABEL, DocumentType.SURAT_KEPUTUSAN] }
          },
          include: { signatures: true }
        });

        // Normalize helper for comparing roles
        const norm = (r: string): string => {
          const MAP: Record<string, string> = {
            'Dekan': 'DEKAN', 'dekan': 'DEKAN',
            'Wakil Dekan I': 'WADEK_1', 'Wakil Dekan 1': 'WADEK_1',
            'Wakil Dekan II': 'WADEK_2', 'Wakil Dekan 2': 'WADEK_2',
            'DEKAN': 'DEKAN', 'WADEK_1': 'WADEK_1', 'WADEK_2': 'WADEK_2',
          };
          return MAP[r] || r.toUpperCase().replace(/\s+/g, '_');
        };

        for (const doc of documents) {
          // Find signatures that need to be cleared
          // Compare normalized roles since DB may store different formats
          const sigsToClear = doc.signatures.filter(
            s => rolesToClearSignatures.includes(norm(s.signerRole)) && (s.signatureUrl || s.status === 'SIGNED')
          );

          // Reset each matching signature
          for (const sig of sigsToClear) {
            await tx.documentSignature.update({
              where: { id: sig.id },
              data: {
                signatureUrl: null,
                signedAt: null,
                status: SignatureStatus.PENDING,
                notes: `Tanda tangan di-reset karena surat dikembalikan ke ${input.targetRole.replace(/_/g, ' ')} oleh ${actorRole.replace(/_/g, ' ')}`
              }
            });
          }

          // If any signatures were cleared, also reset document isSigned flag
          if (sigsToClear.length > 0) {
            await tx.letterDocument.update({
              where: { id: doc.id },
              data: { isSigned: false }
            });
          }
        }
      }

      const letter = await tx.letterInstance.update({
        where: { id: input.letterId },
        data: {
          status: newStatus,
          currentActiveRole: input.targetRole,
          currentActiveUserId: (isStafTarget && input.targetUserId) ? input.targetUserId : null,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: input.letterId,
          actorId,
          actorRole,
          action: LogAction.RETURN,
          fromStatus: LetterStatus.FAKULTAS_VERIFICATION,
          toStatus: newStatus,
          targetRole: input.targetRole,
          notes: input.reason,
          metadata: {
            returnReason: input.reason,
            clearedSignatureRoles: rolesToClearSignatures.length > 0 ? rolesToClearSignatures : undefined
          }
        }
      });

      return letter;
    });
  }

  /**
   * Update draft during verification (Supervisor only)
   */
  async updateDraftContent(
    documentId: string,
    content: Record<string, unknown>,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      const document = await tx.letterDocument.update({
        where: { id: documentId },
        data: {
          content: content as any,
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
          notes: 'Draft diperbarui oleh supervisor'
        }
      });

      return document;
    });
  }
}

export const facultyApprovalRepository = new FacultyApprovalRepository();
