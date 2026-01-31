/**
 * Tembusan Service v2
 * Enhanced service dengan user-based tembusan access
 * 
 * Tembusan adalah salinan surat yang dikirim ke pihak terkait untuk diketahui.
 * User dapat melihat surat tembusan di inbox mereka dan mengunduh dokumennya.
 * 
 * NEW: Pengaju (submitter) otomatis menjadi tembusan
 */

import { prisma } from '../../db';
import { LetterStatus, LogAction } from '../../generated/prisma/client';
import type { TembusanConfig, TembusanAccessResult } from './tembusan.types';

// VIEW action constant
const LOG_ACTION_VIEW = 'VIEW' as unknown as LogAction;

// ============================================================================
// TYPES
// ============================================================================

interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: number;
}

interface InboxParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface TembusanInboxItem {
  id: string;
  documentId: string;
  nomorSurat: string | null;
  perihal: string | null;
  tanggalSurat: string | null;
  jenisDocument: string;
  fileUrl: string | null;
  pemohon: {
    id: string;
    nama: string;
    nim?: string | null;
    email: string;
  };
  penandatangan: Array<{
    nama: string;
    jabatan: string;
    signedAt: string | null;
  }>;
  diterimaTanggal: string;
  sudahDibaca: boolean;
}

interface TembusanDetail extends TembusanInboxItem {
  letterType: {
    id: string;
    name: string;
    code: string;
  };
  submissionValues: Record<string, unknown>;
  contentHtml?: string | null;
  qrCodeUrl?: string | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Parse tembusan data from document
 * Handles both old format (string[]) and new format (TembusanConfig[])
 */
function parseTembusanData(tembusan: unknown): TembusanConfig[] {
  if (!tembusan) return [];
  
  if (Array.isArray(tembusan)) {
    // Check if it's old format (string[]) or new format (TembusanConfig[])
    if (tembusan.length > 0) {
      if (typeof tembusan[0] === 'string') {
        // Old format: convert strings to TembusanConfig
        // These are just names, no userId - for backward compatibility
        return tembusan.map((name: string) => ({
          userId: '', // Empty for old format
          name: name,
          description: ''
        }));
      } else if (typeof tembusan[0] === 'object' && tembusan[0].userId) {
        // New format: already TembusanConfig[]
        return tembusan as TembusanConfig[];
      }
    }
  }
  
  return [];
}

/**
 * Check if user has tembusan access to a completed letter
 */
export async function checkTembusanAccess(
  letterInstanceId: string,
  userId: string
): Promise<TembusanAccessResult> {
  // Get letter instance with documents and submitter info
  const letter = await prisma.letterInstance.findUnique({
    where: { id: letterInstanceId },
    include: {
      documents: {
        where: {
          type: { in: ['SURAT_TUGAS', 'SURAT_TUGAS_TABEL', 'SURAT_KEPUTUSAN'] }
        }
      }
    }
  });

  if (!letter) {
    return { hasAccess: false, reason: 'Surat tidak ditemukan' };
  }

  // Check if letter is completed
  if (letter.status !== LetterStatus.COMPLETED) {
    return { hasAccess: false, reason: 'Surat belum selesai diproses' };
  }

  // Check if user is the submitter (always has access)
  if (letter.createdById === userId) {
    return { hasAccess: true, isSubmitter: true };
  }

  // Check if user is in tembusan list
  for (const doc of letter.documents) {
    const tembusanList = parseTembusanData(doc.tembusan);
    const isRecipient = tembusanList.some(t => t.userId === userId);
    
    if (isRecipient) {
      return { hasAccess: true, isExplicitRecipient: true };
    }
  }

  // Check legacy tembusan (by name matching)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true }
  });

  if (user) {
    for (const doc of letter.documents) {
      const tembusanList = parseTembusanData(doc.tembusan);
      // Check if any tembusan name matches user name (legacy support)
      const isNameMatch = tembusanList.some(t => 
        !t.userId && t.name.toLowerCase().includes(user.name.toLowerCase())
      );
      
      if (isNameMatch) {
        return { hasAccess: true, isExplicitRecipient: true };
      }
    }
  }

  return { hasAccess: false, reason: 'Anda tidak termasuk dalam daftar tembusan surat ini' };
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class TembusanServiceV2 {
  /**
   * Get inbox - daftar surat yang diterima sebagai tembusan
   * 
   * Surat akan muncul di inbox jika:
   * 1. Status surat = COMPLETED
   * 2. readyToDistribute = true
   * 3. User adalah submitter ATAU ada di daftar tembusan
   */
  async getInbox(
    params: InboxParams,
    userId: string
  ): Promise<ServiceResult<{ data: TembusanInboxItem[]; total: number; page: number; limit: number; totalPages: number }>> {
    try {
      const { page = 1, limit = 10, search, sortOrder = 'desc' } = params;
      const skip = (page - 1) * limit;

      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true }
      });

      if (!user) {
        return { success: false, error: 'User not found', code: 404 };
      }

      // Find completed letters where user is either:
      // 1. The submitter (createdById)
      // 2. In the tembusan list (stored in document.tembusan)
      
      // First, get letters where user is the submitter
      const submittedLetterIds = await prisma.letterInstance.findMany({
        where: {
          createdById: userId,
          status: LetterStatus.COMPLETED,
          documents: {
            some: {
              readyToDistribute: true,
              type: { in: ['SURAT_TUGAS', 'SURAT_TUGAS_TABEL', 'SURAT_KEPUTUSAN'] }
            }
          }
        },
        select: { id: true }
      });

      // Get all completed letters with documents that might have user in tembusan
      const completedDocuments = await prisma.letterDocument.findMany({
        where: {
          readyToDistribute: true,
          type: { in: ['SURAT_TUGAS', 'SURAT_TUGAS_TABEL', 'SURAT_KEPUTUSAN'] },
          letterInstance: {
            status: LetterStatus.COMPLETED
          }
        },
        select: {
          id: true,
          letterInstanceId: true,
          tembusan: true
        }
      });

      // Filter documents where user is in tembusan
      const tembusanLetterIds = completedDocuments
        .filter(doc => {
          const tembusanList = parseTembusanData(doc.tembusan);
          return tembusanList.some(t => 
            t.userId === userId || 
            (!t.userId && t.name.toLowerCase().includes(user.name.toLowerCase()))
          );
        })
        .map(doc => doc.letterInstanceId);

      // Combine letter IDs
      const allLetterIds = [...new Set([
        ...submittedLetterIds.map(l => l.id),
        ...tembusanLetterIds
      ])];

      if (allLetterIds.length === 0) {
        return {
          success: true,
          data: {
            data: [],
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
        };
      }

      // Build where clause for final query
      const where: any = {
        letterInstanceId: { in: allLetterIds },
        readyToDistribute: true,
        type: { in: ['SURAT_TUGAS', 'SURAT_TUGAS_TABEL', 'SURAT_KEPUTUSAN'] },
        letterInstance: {
          status: LetterStatus.COMPLETED,
        }
      };

      // Search filter
      if (search) {
        where.OR = [
          { nomorSurat: { contains: search, mode: 'insensitive' } },
          { perihal: { contains: search, mode: 'insensitive' } },
          { 
            letterInstance: { 
              createdBy: { 
                name: { contains: search, mode: 'insensitive' } 
              } 
            } 
          },
        ];
      }

      // Count total
      const total = await prisma.letterDocument.count({ where });

      // Get documents
      const documents = await prisma.letterDocument.findMany({
        where,
        include: {
          letterInstance: {
            include: {
              letterType: true,
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  mahasiswa: {
                    select: { nim: true },
                  },
                },
              },
            },
          },
          signatures: {
            where: { status: 'SIGNED' },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: {
          updatedAt: sortOrder,
        },
        skip,
        take: limit,
      });

      // Get read status for each document
      const readStatuses = await prisma.letterLog.findMany({
        where: {
          action: LOG_ACTION_VIEW,
          actorId: userId,
          letterInstanceId: { in: documents.map(d => d.letterInstanceId) },
        },
        select: {
          letterInstanceId: true,
        },
      });
      const readLetterIds = new Set(readStatuses.map(r => r.letterInstanceId));

      // Transform to inbox items
      const data: TembusanInboxItem[] = documents.map(doc => ({
        id: doc.letterInstanceId,
        documentId: doc.id,
        nomorSurat: doc.nomorSurat,
        perihal: doc.perihal,
        tanggalSurat: doc.tanggalSurat?.toISOString() || null,
        jenisDocument: doc.type === 'SURAT_KEPUTUSAN' ? 'Surat Keputusan' : 'Surat Tugas',
        fileUrl: doc.fileUrl,
        pemohon: {
          id: doc.letterInstance.createdBy.id,
          nama: doc.letterInstance.createdBy.name,
          nim: doc.letterInstance.createdBy.mahasiswa?.nim || null,
          email: doc.letterInstance.createdBy.email,
        },
        penandatangan: doc.signatures.map(sig => ({
          nama: sig.signerName,
          jabatan: sig.signerRole,
          signedAt: sig.signedAt?.toISOString() || null,
        })),
        diterimaTanggal: doc.updatedAt.toISOString(),
        sudahDibaca: readLetterIds.has(doc.letterInstanceId),
      }));

      return {
        success: true,
        data: {
          data,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error getting tembusan inbox:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get inbox',
        code: 500,
      };
    }
  }

  /**
   * Get detail surat tembusan
   */
  async getDetail(
    documentId: string,
    userId: string
  ): Promise<ServiceResult<TembusanDetail>> {
    try {
      const document = await prisma.letterDocument.findUnique({
        where: { id: documentId },
        include: {
          letterInstance: {
            include: {
              letterType: true,
              createdBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  mahasiswa: {
                    select: { nim: true },
                  },
                },
              },
            },
          },
          signatures: {
            where: { status: 'SIGNED' },
            orderBy: { order: 'asc' },
          },
        },
      });

      if (!document) {
        return { success: false, error: 'Document not found', code: 404 };
      }

      // Check if user has access
      const accessResult = await checkTembusanAccess(document.letterInstanceId, userId);
      if (!accessResult.hasAccess) {
        return { success: false, error: accessResult.reason || 'Access denied', code: 403 };
      }

      // Check read status
      const readStatus = await prisma.letterLog.findFirst({
        where: {
          action: LOG_ACTION_VIEW,
          actorId: userId,
          letterInstanceId: document.letterInstanceId,
        },
      });

      const detail: TembusanDetail = {
        id: document.letterInstanceId,
        documentId: document.id,
        nomorSurat: document.nomorSurat,
        perihal: document.perihal,
        tanggalSurat: document.tanggalSurat?.toISOString() || null,
        jenisDocument: document.type === 'SURAT_KEPUTUSAN' ? 'Surat Keputusan' : 'Surat Tugas',
        fileUrl: document.fileUrl,
        pemohon: {
          id: document.letterInstance.createdBy.id,
          nama: document.letterInstance.createdBy.name,
          nim: document.letterInstance.createdBy.mahasiswa?.nim || null,
          email: document.letterInstance.createdBy.email,
        },
        penandatangan: document.signatures.map(sig => ({
          nama: sig.signerName,
          jabatan: sig.signerRole,
          signedAt: sig.signedAt?.toISOString() || null,
        })),
        diterimaTanggal: document.updatedAt.toISOString(),
        sudahDibaca: !!readStatus,
        letterType: {
          id: document.letterInstance.letterType.id,
          name: document.letterInstance.letterType.name,
          code: document.letterInstance.letterType.code,
        },
        submissionValues: document.letterInstance.submissionValues as Record<string, unknown>,
        contentHtml: typeof document.content === 'string' ? document.content : null,
        qrCodeUrl: document.qrCodeUrl,
      };

      return { success: true, data: detail };
    } catch (error) {
      console.error('Error getting tembusan detail:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get detail',
        code: 500,
      };
    }
  }

  /**
   * Mark surat tembusan sebagai sudah dibaca
   */
  async markAsRead(documentId: string, userId: string): Promise<ServiceResult> {
    try {
      const document = await prisma.letterDocument.findUnique({
        where: { id: documentId },
        select: { letterInstanceId: true },
      });

      if (!document) {
        return { success: false, error: 'Document not found', code: 404 };
      }

      // Check access
      const accessResult = await checkTembusanAccess(document.letterInstanceId, userId);
      if (!accessResult.hasAccess) {
        return { success: false, error: 'Access denied', code: 403 };
      }

      // Check if already marked as read
      const existingLog = await prisma.letterLog.findFirst({
        where: {
          letterInstanceId: document.letterInstanceId,
          actorId: userId,
          action: LOG_ACTION_VIEW,
        },
      });

      if (!existingLog) {
        // Log view action
        await prisma.letterLog.create({
          data: {
            letterInstanceId: document.letterInstanceId,
            actorId: userId,
            actorRole: 'TEMBUSAN_RECIPIENT',
            action: LOG_ACTION_VIEW,
            notes: 'Surat tembusan dibaca',
          },
        });
      }

      return { success: true, data: { marked: true } };
    } catch (error) {
      console.error('Error marking as read:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark as read',
        code: 500,
      };
    }
  }

  /**
   * Get jumlah surat tembusan yang belum dibaca
   */
  async getUnreadCount(userId: string): Promise<ServiceResult<{ count: number }>> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      if (!user) {
        return { success: false, error: 'User not found', code: 404 };
      }

      // Get all letters accessible by user
      const submittedLetterIds = await prisma.letterInstance.findMany({
        where: {
          createdById: userId,
          status: LetterStatus.COMPLETED,
          documents: {
            some: {
              readyToDistribute: true,
              type: { in: ['SURAT_TUGAS', 'SURAT_TUGAS_TABEL', 'SURAT_KEPUTUSAN'] }
            }
          }
        },
        select: { id: true }
      });

      const completedDocuments = await prisma.letterDocument.findMany({
        where: {
          readyToDistribute: true,
          type: { in: ['SURAT_TUGAS', 'SURAT_TUGAS_TABEL', 'SURAT_KEPUTUSAN'] },
          letterInstance: {
            status: LetterStatus.COMPLETED
          }
        },
        select: {
          letterInstanceId: true,
          tembusan: true
        }
      });

      const tembusanLetterIds = completedDocuments
        .filter(doc => {
          const tembusanList = parseTembusanData(doc.tembusan);
          return tembusanList.some(t => 
            t.userId === userId || 
            (!t.userId && t.name.toLowerCase().includes(user.name.toLowerCase()))
          );
        })
        .map(doc => doc.letterInstanceId);

      const allLetterIds = [...new Set([
        ...submittedLetterIds.map(l => l.id),
        ...tembusanLetterIds
      ])];

      if (allLetterIds.length === 0) {
        return { success: true, data: { count: 0 } };
      }

      // Get read letters
      const readLogs = await prisma.letterLog.findMany({
        where: {
          action: LOG_ACTION_VIEW,
          actorId: userId,
          letterInstanceId: { in: allLetterIds },
        },
        select: { letterInstanceId: true },
        distinct: ['letterInstanceId'],
      });

      const readLetterIds = new Set(readLogs.map(l => l.letterInstanceId));
      const unreadCount = allLetterIds.filter(id => !readLetterIds.has(id)).length;

      return { success: true, data: { count: unreadCount } };
    } catch (error) {
      console.error('Error getting unread count:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get unread count',
        code: 500,
      };
    }
  }

  /**
   * Check if user can download document (same as checkTembusanAccess)
   */
  async canDownloadDocument(
    documentId: string,
    userId: string
  ): Promise<ServiceResult<{ canDownload: boolean; fileUrl?: string }>> {
    try {
      const document = await prisma.letterDocument.findUnique({
        where: { id: documentId },
        select: { 
          letterInstanceId: true,
          fileUrl: true
        },
      });

      if (!document) {
        return { success: false, error: 'Document not found', code: 404 };
      }

      const accessResult = await checkTembusanAccess(document.letterInstanceId, userId);
      
      return {
        success: true,
        data: {
          canDownload: accessResult.hasAccess,
          fileUrl: accessResult.hasAccess ? document.fileUrl || undefined : undefined
        }
      };
    } catch (error) {
      console.error('Error checking download access:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check access',
        code: 500,
      };
    }
  }
}

export const tembusanServiceV2 = new TembusanServiceV2();
export { parseTembusanData };
