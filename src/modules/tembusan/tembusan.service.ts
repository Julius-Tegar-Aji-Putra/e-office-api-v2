/**
 * Tembusan Service
 * Service untuk fitur tembusan (surat yang diterima sebagai tembusan)
 * 
 * Tembusan adalah salinan surat yang dikirim ke pihak terkait untuk diketahui.
 * User dapat melihat surat tembusan di inbox mereka dan mengunduh dokumennya.
 */

import { prisma } from '../../db';
import { LetterStatus, LogAction } from '../../generated/prisma/client';

// VIEW action constant (will be available after prisma generate)
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
// SERVICE CLASS
// ============================================================================

class TembusanService {
  /**
   * Get inbox - daftar surat yang diterima sebagai tembusan
   * 
   * Surat akan muncul di inbox jika:
   * 1. Status surat = COMPLETED
   * 2. readyToDistribute = true
   * 3. User ada di daftar tembusan (bisa berdasarkan nama, role, atau userId)
   */
  async getInbox(
    params: InboxParams,
    userId: string,
    userRole: string
  ): Promise<ServiceResult<{ data: TembusanInboxItem[]; total: number; page: number; limit: number; totalPages: number }>> {
    try {
      const { page = 1, limit = 10, search, sortOrder = 'desc' } = params;
      const skip = (page - 1) * limit;

      // Get user info untuk matching tembusan
      const user = await prisma.user.findUnique({
        where: { id: userId },
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
      });

      if (!user) {
        return { success: false, error: 'User not found', code: 404 };
      }

      // Build where clause untuk mencari surat yang tembusan-nya termasuk user ini
      // Pendekatan: cari di letterLog dimana user ada di metadata tembusan
      const tembusanLogs = await prisma.letterLog.findMany({
        where: {
          action: 'FINALIZE',
          notes: {
            contains: 'Tembusan dikirim',
          },
          OR: [
            // Match by user name
            {
              metadata: {
                path: ['recipientName'],
                string_contains: user.name,
              },
            },
            // Match by role
            {
              metadata: {
                path: ['recipientRole'],
                equals: userRole,
              },
            },
            // Match by user ID
            {
              metadata: {
                path: ['recipientId'],
                equals: userId,
              },
            },
          ],
        },
        select: {
          letterInstanceId: true,
        },
        distinct: ['letterInstanceId'],
      });

      const letterInstanceIds = tembusanLogs.map(log => log.letterInstanceId);

      if (letterInstanceIds.length === 0) {
        // Return empty result
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

      // Build where clause
      const where: any = {
        letterInstanceId: { in: letterInstanceIds },
        readyToDistribute: true,
        letterInstance: {
          status: LetterStatus.COMPLETED,
        },
        OR: [
          { type: 'SURAT_TUGAS' },
          { type: 'SURAT_TUGAS_TABEL' },
          { type: 'SURAT_KEPUTUSAN' },
        ],
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
                    select: {
                      nim: true,
                    },
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
    userId: string,
    userRole: string
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
                    select: {
                      nim: true,
                    },
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

      // Check if user has access (is in tembusan)
      const hasAccess = await this.checkTembusanAccess(document.letterInstanceId, userId, userRole);
      if (!hasAccess) {
        return { success: false, error: 'Access denied', code: 403 };
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
  async getUnreadCount(userId: string, userRole: string): Promise<ServiceResult<{ count: number }>> {
    try {
      // Get user info
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      if (!user) {
        return { success: false, error: 'User not found', code: 404 };
      }

      // Get all tembusan logs for this user
      const tembusanLogs = await prisma.letterLog.findMany({
        where: {
          action: 'FINALIZE',
          notes: { contains: 'Tembusan dikirim' },
          OR: [
            { metadata: { path: ['recipientName'], string_contains: user.name } },
            { metadata: { path: ['recipientRole'], equals: userRole } },
            { metadata: { path: ['recipientId'], equals: userId } },
          ],
        },
        select: { letterInstanceId: true },
        distinct: ['letterInstanceId'],
      });

      const letterInstanceIds = tembusanLogs.map(log => log.letterInstanceId);

      if (letterInstanceIds.length === 0) {
        return { success: true, data: { count: 0 } };
      }

      // Get read letters
      const readLogs = await prisma.letterLog.findMany({
        where: {
          action: LOG_ACTION_VIEW,
          actorId: userId,
          letterInstanceId: { in: letterInstanceIds },
        },
        select: { letterInstanceId: true },
        distinct: ['letterInstanceId'],
      });

      const readLetterIds = new Set(readLogs.map(l => l.letterInstanceId));
      const unreadCount = letterInstanceIds.filter(id => !readLetterIds.has(id)).length;

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
   * Check if user has access to tembusan document
   */
  private async checkTembusanAccess(
    letterInstanceId: string,
    userId: string,
    userRole: string
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    if (!user) return false;

    const tembusanLog = await prisma.letterLog.findFirst({
      where: {
        letterInstanceId,
        action: 'FINALIZE',
        notes: { contains: 'Tembusan dikirim' },
        OR: [
          { metadata: { path: ['recipientName'], string_contains: user.name } },
          { metadata: { path: ['recipientRole'], equals: userRole } },
          { metadata: { path: ['recipientId'], equals: userId } },
        ],
      },
    });

    return !!tembusanLog;
  }
}

export const tembusanService = new TembusanService();
