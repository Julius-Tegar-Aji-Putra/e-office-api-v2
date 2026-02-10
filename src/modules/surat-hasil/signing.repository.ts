/**
 * Signing Repository
 * Data access layer untuk proses signing dokumen
 */

import { prisma } from '../../db';
import {
  SignatureStatus,
  LogAction,
  LetterStatus,
  Prisma,
} from '../../generated/prisma/client';


// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize signer role to uppercase constant format
 */
const SIGNER_ROLE_NORMALIZATION: Record<string, string> = {
  'Dekan': 'DEKAN',
  'dekan': 'DEKAN',
  'Wakil Dekan I': 'WADEK_1',
  'Wakil Dekan 1': 'WADEK_1',
  'Wakil Dekan II': 'WADEK_2',
  'Wakil Dekan 2': 'WADEK_2',
  'Ketua Departemen': 'KADEP',
  'Ketua Program Studi': 'KAPRODI',
  'Ketua Prodi': 'KAPRODI',
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
// Types
// ============================================================================

export interface SignDocumentInput {
  signatureId: string;
  signatureUrl: string;
  signedAt: Date;
}

export interface UpdateLetterHtmlInput {
  letterInstanceId: string;
  contentHtml: string;
}

// ============================================================================
// Repository Class
// ============================================================================

class SigningRepository {
  /**
   * Get signature record by ID
   */
  async getSignatureById(signatureId: string) {
    return prisma.documentSignature.findUnique({
      where: { id: signatureId },
      include: {
        document: {
          include: {
            letterInstance: {
              include: {
                letterType: true,
              },
            },
            signatures: {
              orderBy: { order: 'asc' },
            },
          },
        },
        signer: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * Get signature for document + role (check if user is authorized)
   */
  async getSignatureByDocumentAndRole(documentId: string, signerRole: string) {
    return prisma.documentSignature.findFirst({
      where: {
        documentId,
        signerRole,
      },
      include: {
        document: {
          include: {
            letterInstance: true,
            signatures: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });
  }

  /**
   * Get pending signature for user
   */
  async getPendingSignatureForUser(documentId: string, signerRole: string) {
    return prisma.documentSignature.findFirst({
      where: {
        documentId,
        signerRole,
        status: SignatureStatus.PENDING,
      },
    });
  }

  /**
   * Mark signature as signed
   */
  async signDocument(input: SignDocumentInput, actorId: string, actorRole: string) {
    const { signatureId, signatureUrl, signedAt } = input;

    return prisma.$transaction(async (tx) => {
      // Update signature record
      const signature = await tx.documentSignature.update({
        where: { id: signatureId },
        data: {
          signatureUrl,
          status: SignatureStatus.SIGNED,
          signedAt,
        },
        include: {
          document: {
            include: {
              letterInstance: true,
              signatures: {
                orderBy: { order: 'asc' },
              },
            },
          },
        },
      });

      // Check if all signatures are complete
      const allSigned = signature.document.signatures.every(
        (sig) => sig.id === signatureId || sig.status === SignatureStatus.SIGNED
      );

      // Find the next signer that hasn't signed yet
      const currentSignerOrder = signature.order;
      const nextPendingSigner = signature.document.signatures.find(
        (sig) => sig.order > currentSignerOrder && sig.status === SignatureStatus.PENDING
      );

      // Update letter instance with next signer role or mark as completed
      if (allSigned) {
        // All signatures complete - mark document as signed
        await tx.letterDocument.update({
          where: { id: signature.document.id },
          data: { isSigned: true },
        });

        // Update letter status to next phase (UPA_NUMBERING or COMPLETED)
        await tx.letterInstance.update({
          where: { id: signature.document.letterInstanceId },
          data: {
            status: LetterStatus.UPA_NUMBERING,
            currentActiveRole: 'UPA_NUMBERING', // Will be handled by UPA
            updatedAt: new Date(),
          },
        });
      } else if (nextPendingSigner) {
        // Move to next signer
        const nextSignerRole = normalizeSignerRole(nextPendingSigner.signerRole);
        
        // Update the signature record if role needs normalization
        if (nextPendingSigner.signerRole !== nextSignerRole) {
          await tx.documentSignature.update({
            where: { id: nextPendingSigner.id },
            data: { signerRole: nextSignerRole },
          });
        }

        await tx.letterInstance.update({
          where: { id: signature.document.letterInstanceId },
          data: {
            currentActiveRole: nextSignerRole,
            updatedAt: new Date(),
          },
        });
      }

      // Log the signing action
      await tx.letterLog.create({
        data: {
          letterInstanceId: signature.document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.SIGN,
          notes: allSigned 
            ? `Dokumen selesai ditandatangani, semua tanda tangan lengkap`
            : nextPendingSigner 
              ? `Dokumen ditandatangani oleh ${actorRole}, diteruskan ke ${normalizeSignerRole(nextPendingSigner.signerRole)}`
              : `Dokumen ditandatangani oleh ${actorRole}`,
        },
      });

      return {
        signature,
        allSigned,
        nextSignerRole: nextPendingSigner ? normalizeSignerRole(nextPendingSigner.signerRole) : null,
      };
    });
  }

  /**
   * Update letter instance with generated HTML content
   */
  async updateLetterHtml(input: UpdateLetterHtmlInput) {
    return prisma.letterInstance.update({
      where: { id: input.letterInstanceId },
      data: {
        contentHtml: input.contentHtml,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get letter instance with all signing context
   */
  async getLetterWithSigningContext(letterId: string) {
    return prisma.letterInstance.findUnique({
      where: { id: letterId },
      include: {
        letterType: true,
        createdBy: {
          include: {
            mahasiswa: {
              include: {
                programStudi: true,
                departemen: true,
              },
            },
            pegawai: {
              include: {
                programStudi: true,
                departemen: true,
              },
            },
          },
        },
        documents: {
          include: {
            signatures: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });
  }

  /**
   * Get document signatures pending for a specific role
   */
  async getDocumentsPendingSignature(signerRole: string, params: { page?: number; limit?: number }) {
    const { page = 1, limit = 10 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentSignatureWhereInput = {
      signerRole,
      status: SignatureStatus.PENDING,
      document: {
        letterInstance: {
          status: {
            in: [LetterStatus.FAKULTAS_SIGNING, LetterStatus.COMPLETED],
          },
        },
      },
    };

    const [data, total] = await Promise.all([
      prisma.documentSignature.findMany({
        where,
        include: {
          document: {
            include: {
              letterInstance: {
                include: {
                  letterType: true,
                  createdBy: {
                    select: { id: true, name: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { document: { letterInstance: { updatedAt: 'desc' } } },
        skip,
        take: limit,
      }),
      prisma.documentSignature.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Check if previous signatures in order are completed
   */
  async canSign(documentId: string, signerRole: string): Promise<{ canSign: boolean; reason?: string }> {
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId },
      include: {
        signatures: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!document) {
      return { canSign: false, reason: 'Dokumen tidak ditemukan' };
    }

    // Find the signature for this role
    const mySignature = document.signatures.find((s) => s.signerRole === signerRole);
    if (!mySignature) {
      return { canSign: false, reason: 'Anda bukan penandatangan untuk dokumen ini' };
    }

    if (mySignature.status === SignatureStatus.SIGNED) {
      return { canSign: false, reason: 'Anda sudah menandatangani dokumen ini' };
    }

    // Check if all previous signatures (lower order) are completed
    const previousSignatures = document.signatures.filter((s) => s.order < mySignature.order);
    const allPreviousSigned = previousSignatures.every((s) => s.status === SignatureStatus.SIGNED);

    if (!allPreviousSigned) {
      return { canSign: false, reason: 'Menunggu tanda tangan sebelumnya' };
    }

    return { canSign: true };
  }
}

export const signingRepository = new SigningRepository();
