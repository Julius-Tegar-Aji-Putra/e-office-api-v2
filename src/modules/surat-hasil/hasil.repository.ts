/**
 * Surat Hasil Repository
 * Data access layer untuk modul drafting SK/ST/SP oleh staf
 */

import { prisma } from '../../db';
import { Prisma, LetterStatus, LogAction, DocumentType, LetterCategory } from '../../generated/prisma/client';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * All document types that are considered "Surat Hasil"
 */
export const SURAT_HASIL_TYPES = [
  DocumentType.SURAT_TUGAS, 
  DocumentType.SURAT_KEPUTUSAN,
  DocumentType.SURAT_PENGANTAR,
  DocumentType.SURAT_TUGAS_TABEL
] as const;

/**
 * Map document type to label
 */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  [DocumentType.SURAT_TUGAS]: 'Surat Tugas',
  [DocumentType.SURAT_KEPUTUSAN]: 'Surat Keputusan',
  [DocumentType.SURAT_PENGANTAR]: 'Surat Pengantar',
  [DocumentType.SURAT_TUGAS_TABEL]: 'Surat Tugas (Tabel)'
};

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

/**
 * Helper untuk menentukan hierarki penandatangan
 * Lower number = Higher Priority (harus TTD lebih dulu)
 * Urutan: WADEK_2 -> WADEK_1 -> DEKAN
 */
function getSignerHierarchy(role: string): number {
  const HIERARCHY: Record<string, number> = {
    'WADEK_2': 1,
    'WADEK_1': 2,
    'DEKAN': 3
  };
  return HIERARCHY[role] ?? 99;
}

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
    // Position data for signature placement on PDF
    x?: number;
    y?: number;
    page?: number;
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
          type: { in: SURAT_HASIL_TYPES as unknown as DocumentType[] }
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
            where: { type: { in: SURAT_HASIL_TYPES as unknown as DocumentType[] } }
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

      // Create signature placeholders with position data
      for (const sig of signatories) {
        await tx.documentSignature.create({
          data: {
            documentId: document.id,
            signerId: actorId,
            signerRole: normalizeSignerRole(sig.signerRole),
            signerName: sig.signerName,
            signerNip: sig.signerNip,
            order: sig.order,
            positionX: sig.x,
            positionY: sig.y,
            positionPage: sig.page
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
          notes: `Draft ${DOCUMENT_TYPE_LABELS[documentType]} dibuat`
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

  /**
   * Supervisor approve verification -> MANAJER_TU (bukan langsung signing)
   * Flow: SUPERVISOR → approve → MANAJER_TU
   */
  async approveVerification(
    letterId: string,
    actorId: string,
    actorRole: string,
    notes?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Supervisor approve -> kirim ke MANAJER_TU
      const nextRole = 'MANAJER_TU';

      const updated = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.FAKULTAS_VERIFICATION, // Tetap VERIFICATION, role berubah
          currentActiveRole: nextRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.APPROVE,
          fromStatus: LetterStatus.FAKULTAS_VERIFICATION,
          toStatus: LetterStatus.FAKULTAS_VERIFICATION,
          targetRole: nextRole,
          notes: notes || 'Draft diverifikasi Supervisor, diteruskan ke Manajer TU'
        }
      });

      return updated;
    });
  }

  /**
   * Manajer TU approve verification -> FAKULTAS_SIGNING
   * Flow: MANAJER_TU → approve → First Signer by HIERARCHY (WADEK_2 -> WADEK_1 -> DEKAN)
   */
  async manajerTuApproveVerification(
    letterId: string,
    actorId: string,
    actorRole: string,
    notes?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Get signers from ST/SK document
      const letter = await tx.letterInstance.findUnique({
        where: { id: letterId },
        include: {
          documents: {
            where: {
              type: { in: SURAT_HASIL_TYPES as unknown as DocumentType[] }
            },
            include: {
              signatures: true // Get all signatures, we'll sort by hierarchy
            }
          }
        }
      });

      if (!letter || !letter.documents[0]) {
        throw new Error('Surat atau dokumen tidak ditemukan');
      }

      // Sort signatures by hierarchy: WADEK_2 (1) -> WADEK_1 (2) -> DEKAN (3)
      const sortedSignatures = [...letter.documents[0].signatures]
        .filter(s => !s.signatureUrl) // Only unsigned
        .sort((a, b) => getSignerHierarchy(a.signerRole) - getSignerHierarchy(b.signerRole));

      // Get first signer by hierarchy (lowest rank = first to sign)
      const firstByHierarchy = sortedSignatures[0];
      const rawRole = firstByHierarchy?.signerRole || 'DEKAN';
      const nextRole = normalizeSignerRole(rawRole);

      // Also update the signature record if it needs normalization
      if (firstByHierarchy && firstByHierarchy.signerRole !== nextRole) {
        await tx.documentSignature.update({
          where: { id: firstByHierarchy.id },
          data: { signerRole: nextRole }
        });
      }

      const updated = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.FAKULTAS_SIGNING,
          currentActiveRole: nextRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.APPROVE,
          fromStatus: LetterStatus.FAKULTAS_VERIFICATION,
          toStatus: LetterStatus.FAKULTAS_SIGNING,
          targetRole: nextRole,
          notes: notes || `Draft diverifikasi Manajer TU, diteruskan ke ${nextRole} untuk ditandatangani`
        }
      });

      return updated;
    });
  }

  /**
   * Supervisor return draft for revision -> FAKULTAS_DRAFTING
   */
  async returnForRevision(
    letterId: string,
    actorId: string,
    actorRole: string,
    reason: string,
    targetStaff: string
  ) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.FAKULTAS_DRAFTING,
          currentActiveRole: targetStaff,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.RETURN,
          fromStatus: LetterStatus.FAKULTAS_VERIFICATION,
          toStatus: LetterStatus.FAKULTAS_DRAFTING,
          targetRole: targetStaff,
          notes: reason
        }
      });

      return updated;
    });
  }

  /**
   * Pejabat (Dekan/Wadek) sign SK/ST document
   * Flow: FAKULTAS_SIGNING → sign → UPA_NUMBERING (if last signer) atau next signer
   */
  async signDocument(
    letterId: string,
    signatureUrl: string,
    signerName: string,
    signerNip: string | undefined,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Get letter with SK/ST document and signatures
      const letter = await tx.letterInstance.findUnique({
        where: { id: letterId },
        include: {
          documents: {
            where: {
              type: { in: SURAT_HASIL_TYPES as unknown as DocumentType[] }
            },
            include: {
              signatures: { orderBy: { order: 'asc' } }
            }
          }
        }
      });

      if (!letter || letter.documents.length === 0) {
        throw new Error('Surat atau dokumen tidak ditemukan');
      }

      // Normalize actor role for comparison
      const normalizedActorRole = normalizeSignerRole(actorRole);
      
      // Find the document that has a pending signature for this role
      // (can't just use documents[0] because there might be multiple documents)
      let targetDocument = null;
      let pendingSignature = null;

      for (const doc of letter.documents) {
        const sig = doc.signatures.find(
          s => normalizeSignerRole(s.signerRole) === normalizedActorRole && s.status === 'PENDING'
        );
        if (sig) {
          targetDocument = doc;
          pendingSignature = sig;
          break;
        }
      }
      
      // Debug: Log signature states
      console.log('[signDocument] Looking for signature:', {
        letterId,
        actorRole,
        normalizedActorRole,
        documentsCount: letter.documents.length,
        allSignatures: letter.documents.flatMap(d => d.signatures.map(s => ({
          docType: d.type,
          signerRole: s.signerRole,
          status: s.status
        })))
      });

      if (!targetDocument || !pendingSignature) {
        throw new Error('Tidak ada tanda tangan yang pending untuk role ini');
      }

      const document = targetDocument;

      // Update signature
      await tx.documentSignature.update({
        where: { id: pendingSignature.id },
        data: {
          signerId: actorId,
          signerName,
          signerNip,
          signatureUrl,
          status: 'SIGNED',
          signedAt: new Date()
        }
      });

      // Check if all signatures complete
      const remainingPending = document.signatures.filter(
        s => s.id !== pendingSignature.id && s.status === 'PENDING'
      );

      let nextStatus: LetterStatus;
      let nextRole: string;

      if (remainingPending.length === 0) {
        // All signed -> UPA_NUMBERING
        nextStatus = LetterStatus.UPA_NUMBERING;
        nextRole = 'UPA';
        
        // Mark document as signed
        await tx.letterDocument.update({
          where: { id: document.id },
          data: { isSigned: true, updatedAt: new Date() }
        });
      } else {
        // Still have pending signers
        nextStatus = LetterStatus.FAKULTAS_SIGNING;
        nextRole = remainingPending[0].signerRole;
      }

      const updated = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: nextStatus,
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
          fromStatus: LetterStatus.FAKULTAS_SIGNING,
          toStatus: nextStatus,
          targetRole: nextRole,
          notes: `Dokumen ditandatangani oleh ${signerName}`
        }
      });

      return updated;
    });
  }
}

export const hasilRepository = new HasilRepository();
