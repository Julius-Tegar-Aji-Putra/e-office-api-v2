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

      // If all signed, mark document as signed
      if (allSigned) {
        await tx.letterDocument.update({
          where: { id: signature.document.id },
          data: { isSigned: true },
        });
      }

      // Log the signing action
      await tx.letterLog.create({
        data: {
          letterInstanceId: signature.document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.SIGN,
          notes: `Dokumen ditandatangani oleh ${actorRole}`,
        },
      });

      return {
        signature,
        allSigned,
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
