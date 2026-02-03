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

export interface CreateStaffSuratInput {
  category: 'AKADEMIK' | 'SUMBER_DAYA' | 'UMUM';
  documentType: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN' | 'SURAT_TUGAS_TABEL';
  content: Prisma.JsonValue;
  tembusan?: Prisma.JsonValue;  // Now supports TembusanRecipient[] format
  perihal?: string;
  targetSupervisor?: 'SUPERVISOR_AKADEMIK' | 'SUPERVISOR_SUMBER_DAYA'; // Untuk kategori UMUM
  signatories: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string;
    order: number;
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
  mode?: 'patch' | 'overwrite';
  signatories?: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string;
    order: number;
    x?: number;
    y?: number;
    page?: number;
  }>;
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
   * Supports two modes:
   * - "patch" (default): Only update provided fields, keep existing data
   * - "overwrite": Replace all data with new input
   */
  async updateDraft(input: UpdateDraftInput, actorId: string, actorRole: string) {
    const isOverwrite = input.mode === 'overwrite';
    
    return prisma.$transaction(async (tx) => {
      // Get existing document first
      const existingDoc = await tx.letterDocument.findUnique({
        where: { id: input.documentId },
        include: { signatures: true }
      });

      if (!existingDoc) {
        throw new Error('Document not found');
      }

      // Build update data based on mode
      const updateData: Prisma.LetterDocumentUpdateInput = {
        updatedAt: new Date()
      };

      if (isOverwrite) {
        // Overwrite mode: Replace all fields (set to empty if not provided)
        updateData.content = input.content ?? {};
        updateData.tembusan = input.tembusan ?? [];
        if (input.perihal !== undefined) {
          updateData.perihal = input.perihal;
        }
      } else {
        // Patch mode: Only update provided fields, keep existing
        if (input.content !== undefined) {
          updateData.content = input.content as Prisma.InputJsonValue;
        }
        if (input.tembusan !== undefined) {
          updateData.tembusan = input.tembusan as Prisma.InputJsonValue;
        }
        if (input.perihal !== undefined) {
          updateData.perihal = input.perihal;
        }
      }

      // Update document
      const document = await tx.letterDocument.update({
        where: { id: input.documentId },
        data: updateData,
        include: { letterInstance: true }
      });

      // Handle signatories update if provided
      if (input.signatories && input.signatories.length > 0) {
        if (isOverwrite) {
          // Overwrite mode: Delete all existing signatures and create new ones
          await tx.documentSignature.deleteMany({
            where: { documentId: input.documentId }
          });
        } else {
          // Patch mode: Sync signatures (delete removed, update existing, add new)
          const existingRoles = existingDoc.signatures.map(s => s.signerRole);
          const newRoles = input.signatories.map(s => normalizeSignerRole(s.signerRole));
          
          // Delete signatures that are no longer in the list
          const rolesToDelete = existingRoles.filter(r => !newRoles.includes(r));
          if (rolesToDelete.length > 0) {
            await tx.documentSignature.deleteMany({
              where: { 
                documentId: input.documentId,
                signerRole: { in: rolesToDelete }
              }
            });
          }
        }

        // Create/update signatories
        for (const sig of input.signatories) {
          const normalizedRole = normalizeSignerRole(sig.signerRole);
          const existingSig = existingDoc.signatures.find(s => s.signerRole === normalizedRole);
          
          if (existingSig && !isOverwrite) {
            // Update existing signature
            await tx.documentSignature.update({
              where: { id: existingSig.id },
              data: {
                signerName: sig.signerName,
                signerNip: sig.signerNip,
                order: sig.order,
                positionX: sig.x,
                positionY: sig.y,
                positionPage: sig.page
              }
            });
          } else {
            // Create new signature
            await tx.documentSignature.create({
              data: {
                documentId: input.documentId,
                signerId: actorId,
                signerRole: normalizedRole,
                signerName: sig.signerName,
                signerNip: sig.signerNip,
                order: sig.order,
                positionX: sig.x,
                positionY: sig.y,
                positionPage: sig.page
              }
            });
          }
        }
      }

      await tx.letterLog.create({
        data: {
          letterInstanceId: document.letterInstanceId,
          actorId,
          actorRole,
          action: LogAction.DRAFT_UPDATE,
          notes: isOverwrite ? 'Draft dibuat ulang (overwrite)' : 'Draft diperbarui'
        }
      });

      // Return updated document with signatures
      return tx.letterDocument.findUnique({
        where: { id: input.documentId },
        include: { 
          letterInstance: true,
          signatures: { orderBy: { order: 'asc' } }
        }
      });
    });
  }

  /**
   * Submit draft for verification -> FAKULTAS_VERIFICATION
   */
  async submitForVerification(
    letterId: string,
    actorId: string,
    actorRole: string,
    category: LetterCategory,
    targetSupervisor?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Get letter to check submissionValues for targetSupervisor
      const existingLetter = await tx.letterInstance.findUnique({
        where: { id: letterId },
        select: { submissionValues: true, category: true }
      });
      
      // Determine next verifier based on category and targetSupervisor
      let nextRole: string;
      if (actorRole === 'STAF_AKADEMIK' && category !== 'UMUM') {
        nextRole = 'SUPERVISOR_AKADEMIK';
      } else if (actorRole === 'STAF_SUMBER_DAYA' && category !== 'UMUM') {
        nextRole = 'SUPERVISOR_SUMBER_DAYA';
      } else {
        // For UMUM category, use targetSupervisor from param or submissionValues
        const storedTarget = (existingLetter?.submissionValues as any)?.targetSupervisor;
        nextRole = targetSupervisor || storedTarget || 
          (actorRole === 'STAF_AKADEMIK' ? 'SUPERVISOR_AKADEMIK' : 'SUPERVISOR_SUMBER_DAYA');
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
   * Manajer TU approve verification -> Next role in HIERARCHY
   * PENTING: Flow SELALU berurutan sesuai hierarki, tidak boleh skip!
   * 
   * Flow berdasarkan kategori:
   * - AKADEMIK: MTU -> Wadek 1 -> Dekan
   * - SUMBER_DAYA: MTU -> Wadek 2 -> Dekan  
   * - UMUM: MTU -> Wadek 2 -> Wadek 1 -> Dekan
   * 
   * Target tanda tangan HANYA menentukan jenis tombol (Verifikasi atau Tanda Tangan),
   * BUKAN urutan alur!
   */
  async manajerTuApproveVerification(
    letterId: string,
    actorId: string,
    actorRole: string,
    notes?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Get letter with category
      const letter = await tx.letterInstance.findUnique({
        where: { id: letterId },
        include: {
          letterType: true,
          documents: {
            where: {
              type: { in: SURAT_HASIL_TYPES as unknown as DocumentType[] }
            },
            include: {
              signatures: true
            }
          }
        }
      });

      if (!letter || !letter.documents[0]) {
        throw new Error('Surat atau dokumen tidak ditemukan');
      }

      // Determine next role based on category hierarchy (BUKAN berdasarkan target tanda tangan)
      const category = (letter.category || letter.letterType.category) as LetterCategory;
      
      let nextRole: string;
      
      // Flow SELALU urut sesuai hierarki:
      // AKADEMIK: MTU -> Wadek 1 -> Dekan
      // SUMBER_DAYA: MTU -> Wadek 2 -> Dekan
      // UMUM: MTU -> Wadek 2 -> Wadek 1 -> Dekan
      switch (category) {
        case 'AKADEMIK':
          nextRole = 'WADEK_1';
          break;
        case 'SUMBER_DAYA':
          nextRole = 'WADEK_2';
          break;
        case 'UMUM':
        default:
          nextRole = 'WADEK_2'; // UMUM mulai dari Wadek 2
          break;
      }

      const updated = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          // Status berubah ke SIGNING karena sudah masuk fase pejabat
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
          action: LogAction.VERIFY,
          fromStatus: LetterStatus.FAKULTAS_VERIFICATION,
          toStatus: LetterStatus.FAKULTAS_SIGNING,
          targetRole: nextRole,
          notes: notes || `Draft diverifikasi Manajer TU, diteruskan ke ${nextRole}`
        }
      });

      return updated;
    });
  }

  /**
   * Return letter for revision - FLEKSIBEL (bisa skip role)
   * Target bisa ke role manapun yang ada di bawah posisi user saat ini
   * Status: DRAFTING jika target adalah staf, VERIFICATION jika target adalah supervisor/pejabat
   */
  async returnForRevision(
    letterId: string,
    actorId: string,
    actorRole: string,
    reason: string,
    targetRole: string,
    targetStatus?: LetterStatus
  ) {
    return prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.findUnique({
        where: { id: letterId },
        select: { status: true }
      });

      if (!letter) {
        throw new Error('Surat tidak ditemukan');
      }

      // Determine status based on target role if not provided
      const isStafTarget = ['STAF_AKADEMIK', 'STAF_SUMBER_DAYA'].includes(targetRole);
      const finalStatus = targetStatus || (isStafTarget ? LetterStatus.FAKULTAS_DRAFTING : LetterStatus.FAKULTAS_VERIFICATION);

      const updated = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: finalStatus,
          currentActiveRole: targetRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.RETURN,
          fromStatus: letter.status,
          toStatus: finalStatus,
          targetRole: targetRole,
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
          letterType: true, // IMPORTANT: Include letterType untuk get category
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

      // Get category untuk determine next role berdasarkan hierarki
      // Safe navigation untuk backward compatibility dengan data lama
      const category = (letter.category || letter.letterType?.category || 'UMUM') as LetterCategory;
      
      console.log('[signDocument] DEBUG CATEGORY:', {
        letterId,
        letterCategory: letter.category,
        letterTypeCategory: letter.letterType?.category,
        finalCategory: category,
        currentSigner: normalizedActorRole
      });
      
      // Determine next role based on CATEGORY HIERARCHY, bukan berdasarkan daftar signature!
      // AKADEMIK: ... → Wadek 1 → Dekan
      // SUMBER_DAYA: ... → Wadek 2 → Dekan
      // UMUM: ... → Wadek 2 → Wadek 1 → Dekan
      
      let nextStatus: LetterStatus;
      let nextRole: string;
      
      // Check apakah current signer adalah Dekan (final signer)
      if (normalizedActorRole === 'DEKAN') {
        // Dekan sudah sign, semua selesai → UPA
        nextStatus = LetterStatus.UPA_NUMBERING;
        nextRole = 'UPA';
        
        // Mark document as signed
        await tx.letterDocument.update({
          where: { id: document.id },
          data: { isSigned: true, updatedAt: new Date() }
        });
      } else {
        // Tentukan next role berdasarkan hierarki kategori
        nextStatus = LetterStatus.FAKULTAS_SIGNING;
        
        switch (category) {
          case 'AKADEMIK':
            // Flow: Wadek 1 → Dekan
            if (normalizedActorRole === 'WADEK_1') {
              nextRole = 'DEKAN';
            } else {
              nextRole = 'WADEK_1'; // Fallback
            }
            break;
            
          case 'SUMBER_DAYA':
            // Flow: Wadek 2 → Dekan
            if (normalizedActorRole === 'WADEK_2') {
              nextRole = 'DEKAN';
            } else {
              nextRole = 'WADEK_2'; // Fallback
            }
            break;
            
          case 'UMUM':
          default:
            // Flow: Wadek 2 → Wadek 1 → Dekan
            if (normalizedActorRole === 'WADEK_2') {
              nextRole = 'WADEK_1';
            } else if (normalizedActorRole === 'WADEK_1') {
              nextRole = 'DEKAN';
            } else {
              nextRole = 'WADEK_2'; // Fallback
            }
            break;
        }
      }
      
      console.log('[signDocument] Routing based on hierarchy:', {
        category,
        currentSigner: normalizedActorRole,
        nextRole,
        nextStatus
      });

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

  /**
   * Create new letter instance directly by staff (without submission)
   * For STAF_AKADEMIK and STAF_SUMBER_DAYA to create ST/SK directly
   */
  async createStaffSurat(input: CreateStaffSuratInput, actorId: string, actorRole: string) {
    const { category, documentType, content, tembusan, perihal, signatories, targetSupervisor } = input;

    return prisma.$transaction(async (tx) => {
      // First, we need a letter type for staff-created letters
      // Look for or create a generic letter type for staff direct creation
      let letterType = await tx.letterType.findFirst({
        where: { 
          code: `STAFF_DIRECT_${category}`,
          deletedAt: null
        }
      });

      if (!letterType) {
        letterType = await tx.letterType.create({
          data: {
            name: `Surat Langsung Staf ${category === 'AKADEMIK' ? 'Akademik' : 'Sumber Daya'}`,
            code: `STAFF_DIRECT_${category}`,
            description: 'Surat yang dibuat langsung oleh staf tanpa melalui submission',
            category: category as LetterCategory,
            requiresPengantar: false,
            requiresDekanSign: true,
            requiresWadekSign: false
          }
        });
      }

      // Create letter instance
      // Store targetSupervisor in submissionValues for UMUM category
      const submissionValues = {
        ...(content as object),
        ...(targetSupervisor ? { targetSupervisor } : {})
      };
      
      const letterInstance = await tx.letterInstance.create({
        data: {
          letterTypeId: letterType.id,
          createdById: actorId,
          submissionValues: submissionValues as any,
          status: LetterStatus.FAKULTAS_DRAFTING,
          currentActiveRole: actorRole,
          category: category as LetterCategory,
          priority: 'NORMAL'
        }
      });

      // Create document
      const document = await tx.letterDocument.create({
        data: {
          letterInstanceId: letterInstance.id,
          type: documentType as DocumentType,
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

      // Log creation
      await tx.letterLog.create({
        data: {
          letterInstanceId: letterInstance.id,
          actorId,
          actorRole,
          action: LogAction.DRAFT_CREATE,
          fromStatus: null,
          toStatus: LetterStatus.FAKULTAS_DRAFTING,
          notes: `Surat ${DOCUMENT_TYPE_LABELS[documentType as DocumentType]} dibuat langsung oleh staf`
        }
      });

      return {
        letterInstance,
        document
      };
    });
  }

  /**
   * Pejabat (Wadek/Dekan) verifikasi surat dan teruskan ke next role
   * PENTING: Ini untuk pejabat yang BUKAN penandatangan, hanya memverifikasi
   * Flow SELALU urut sesuai hierarki, tidak boleh skip!
   * 
   * Hierarki berdasarkan kategori:
   * - AKADEMIK: Wadek 1 -> Dekan -> UPA
   * - SUMBER_DAYA: Wadek 2 -> Dekan -> UPA
   * - UMUM: Wadek 2 -> Wadek 1 -> Dekan -> UPA
   */
  async pejabatVerifyDocument(
    letterId: string,
    actorId: string,
    actorRole: string,
    notes?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.findUnique({
        where: { id: letterId },
        include: {
          letterType: true,
          documents: {
            where: {
              type: { in: SURAT_HASIL_TYPES as unknown as DocumentType[] }
            },
            include: {
              signatures: true
            }
          }
        }
      });

      if (!letter) {
        throw new Error('Surat tidak ditemukan');
      }

      const category = (letter.category || letter.letterType.category) as LetterCategory;
      const normalizedActorRole = normalizeSignerRole(actorRole);

      // Determine next role based on category hierarchy
      let nextRole: string;
      let nextStatus: LetterStatus;
      
      switch (category) {
        case 'AKADEMIK':
          // Flow: Wadek 1 -> Dekan -> UPA
          if (normalizedActorRole === 'WADEK_1') {
            nextRole = 'DEKAN';
            nextStatus = LetterStatus.FAKULTAS_SIGNING;
          } else if (normalizedActorRole === 'DEKAN') {
            // Dekan bukan penandatangan, langsung ke UPA
            nextRole = 'UPA';
            nextStatus = LetterStatus.UPA_NUMBERING;
          } else {
            throw new Error('Flow tidak valid untuk kategori AKADEMIK');
          }
          break;
          
        case 'SUMBER_DAYA':
          // Flow: Wadek 2 -> Dekan -> UPA
          if (normalizedActorRole === 'WADEK_2') {
            nextRole = 'DEKAN';
            nextStatus = LetterStatus.FAKULTAS_SIGNING;
          } else if (normalizedActorRole === 'DEKAN') {
            // Dekan bukan penandatangan, langsung ke UPA
            nextRole = 'UPA';
            nextStatus = LetterStatus.UPA_NUMBERING;
          } else {
            throw new Error('Flow tidak valid untuk kategori SUMBER_DAYA');
          }
          break;
          
        case 'UMUM':
        default:
          // Flow: Wadek 2 -> Wadek 1 -> Dekan -> UPA
          if (normalizedActorRole === 'WADEK_2') {
            nextRole = 'WADEK_1';
            nextStatus = LetterStatus.FAKULTAS_SIGNING;
          } else if (normalizedActorRole === 'WADEK_1') {
            nextRole = 'DEKAN';
            nextStatus = LetterStatus.FAKULTAS_SIGNING;
          } else if (normalizedActorRole === 'DEKAN') {
            // Dekan bukan penandatangan, langsung ke UPA
            nextRole = 'UPA';
            nextStatus = LetterStatus.UPA_NUMBERING;
          } else {
            throw new Error('Flow tidak valid untuk kategori UMUM');
          }
          break;
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
          action: LogAction.VERIFY,
          fromStatus: LetterStatus.FAKULTAS_SIGNING,
          toStatus: nextStatus,
          targetRole: nextRole,
          notes: notes || `Diverifikasi oleh ${actorRole}, diteruskan ke ${nextRole}`
        }
      });

      return updated;
    });
  }
}

export const hasilRepository = new HasilRepository();
