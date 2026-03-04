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
import { minioService, MinioService } from '../../shared/services/minio.service';

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
  // Document type for frontend template selection
  documentType: 'SURAT_TUGAS' | 'SURAT_KEPUTUSAN' | 'SURAT_TUGAS_TABEL' | 'SURAT_PENGANTAR';
  // Form data JSON for frontend template rendering
  content: Record<string, unknown> | null;
  submissionValues: Record<string, unknown>;
  contentHtml?: string | null;
  qrCodeUrl?: string | null;
  attachmentUrls?: unknown[] | null;
  // Full signature data for frontend rendering
  signaturesFull: Array<{
    signerRole: string;
    signerName: string;
    signerNip?: string | null;
    signatureUrl?: string | null;
    prefix?: string | null;
    signedAt: string | null;
    order: number;
  }>;
  // Tembusan recipient list for template rendering
  tembusanList: Array<{
    userId?: string;
    name: string;
    description?: string;
    email?: string;
    role?: string;
  }>;
  // Stempel/seal info
  sealImageUrl?: string | null;
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

  // Check if user is in tembusan list
  // Note: createdById no longer grants automatic tembusan access.
  // Submitter access is controlled by the "Pengaju Surat" checkbox (__PENGAJU__ marker).
  // Submitters can still track their letters via the separate submission tracking page.
  for (const doc of letter.documents) {
    const tembusanList = parseTembusanData(doc.tembusan);
    const isRecipient = tembusanList.some(t => {
      // Resolve __PENGAJU__ marker to actual submitter (createdById)
      if (t.userId === '__PENGAJU__') {
        return letter.createdById === userId;
      }
      return t.userId === userId;
    });

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
  constructor(
    private minio: MinioService = minioService
  ) { }

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

      // Find completed letters where user is in the tembusan list
      // Note: createdById no longer grants automatic tembusan inbox access.
      // The "Pengaju Surat" checkbox controls this via __PENGAJU__ marker.
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
          tembusan: true,
          letterInstance: {
            select: { createdById: true }
          }
        }
      });

      // Filter documents where user is in tembusan
      // Resolve __PENGAJU__ marker to actual submitter (createdById)
      const allLetterIds = completedDocuments
        .filter(doc => {
          const tembusanList = parseTembusanData(doc.tembusan);
          return tembusanList.some(t => {
            // Resolve __PENGAJU__ marker to the letter's submitter
            if (t.userId === '__PENGAJU__') {
              return doc.letterInstance.createdById === userId;
            }
            return t.userId === userId ||
              (!t.userId && t.name.toLowerCase().includes(user.name.toLowerCase()));
          });
        })
        .map(doc => doc.letterInstanceId);

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
                  pegawai: {
                    select: { jabatan: true },
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

      // Convert attachmentUrls storage paths to signed URLs
      let signedAttachmentUrls: Array<{ url: string; name: string }> | null = null;
      if (document.attachmentUrls && Array.isArray(document.attachmentUrls)) {
        signedAttachmentUrls = await Promise.all(
          document.attachmentUrls.map(async (item: any) => {
            // Handle old string format
            if (typeof item === 'string') {
              const urlPath = item.split('/').pop() || 'Lampiran';
              const cleanName = urlPath.replace(/^\d+-/, ''); // Remove timestamp prefix
              const signedUrl = item.startsWith('http')
                ? item
                : await this.minio.getFileUrl(item).catch(() => item);
              return { url: signedUrl, name: decodeURIComponent(cleanName) };
            }
            // Handle new object format { url, name }
            const attachment = item as { url: string; name: string };
            if (attachment.url && !attachment.url.startsWith('http')) {
              try {
                const signedUrl = await this.minio.getFileUrl(attachment.url);
                return { url: signedUrl, name: attachment.name };
              } catch (error) {
                console.error(`Failed to get signed URL for attachment:`, error);
                return attachment;
              }
            }
            return attachment;
          })
        );
      }

      // Convert signatureUrl to base64 data URLs (avoids CORS issues in frontend html2canvas)
      const signaturesFull = await Promise.all(
        document.signatures.map(async (sig) => {
          let resolvedSignatureUrl: string | null = null;

          if (sig.signatureUrl) {
            // Already a data URL — pass through
            if (sig.signatureUrl.startsWith('data:')) {
              resolvedSignatureUrl = sig.signatureUrl;
            } else {
              // Storage path or http URL — download and convert to base64
              try {
                const storagePath = sig.signatureUrl.startsWith('http')
                  ? sig.signatureUrl  // fallback: use as-is if already http
                  : sig.signatureUrl;

                if (!storagePath.startsWith('http')) {
                  const buffer = await this.minio.downloadFile(storagePath);
                  const ext = storagePath.split('.').pop()?.toLowerCase();
                  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
                  resolvedSignatureUrl = `data:${mime};base64,${buffer.toString('base64')}`;
                } else {
                  // If it's an HTTP URL (e.g. MinIO signed URL), fetch it server-side to convert to base64
                  // This avoids CORS issues on the frontend (html2canvas)
                  const response = await fetch(storagePath);
                  if (!response.ok) throw new Error(`Failed to fetch signature image: ${response.statusText}`);

                  const arrayBuffer = await response.arrayBuffer();
                  const buffer = Buffer.from(arrayBuffer);

                  // Detect mime type from extensions or headers
                  const contentType = response.headers.get('content-type') || 'image/png';
                  resolvedSignatureUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
                }
              } catch (error) {
                console.error(`Failed to resolve signatureUrl for ${sig.signerName}:`, error);
                // Last resort: try signed URL only for storage paths (not expired http URLs)
                try {
                  if (!sig.signatureUrl.startsWith('http')) {
                    resolvedSignatureUrl = await this.minio.getFileUrl(sig.signatureUrl);
                  }
                } catch {
                  resolvedSignatureUrl = null;
                }
              }
            }
          }

          return {
            signerRole: sig.signerRole,
            signerName: sig.signerName,
            signerNip: sig.signerNip || null,
            signatureUrl: resolvedSignatureUrl,
            prefix: sig.prefix || null,
            signedAt: sig.signedAt?.toISOString() || null,
            order: sig.order,
          };
        })
      );

      // Parse tembusan data from document and enrich with real user data
      let processedTembusan: any[] = [];
      if (document.tembusan && Array.isArray(document.tembusan)) {
        processedTembusan = await Promise.all(
          document.tembusan.map(async (item: any) => {
            if (typeof item === 'string') return { name: item };
            if (!item.userId) return item;

            if (item.userId === '__PENGAJU__') {
              const pengajuRole = document.letterInstance.createdBy.pegawai?.jabatan || 'Mahasiswa';
              return {
                ...item,
                name: document.letterInstance.createdBy.name,
                email: document.letterInstance.createdBy.email,
                role: `${pengajuRole} (Pengaju Surat)`
              };
            }

            try {
              const tUser = await prisma.user.findUnique({
                where: { id: item.userId },
                include: { pegawai: true, mahasiswa: { include: { programStudi: true } } }
              });
              if (tUser) {
                const role = tUser.pegawai?.jabatan ||
                  (tUser.mahasiswa ? `Mahasiswa - ${tUser.mahasiswa.programStudi?.name || ''}` : null) ||
                  item.role || item.description || 'Unknown Role';
                return {
                  ...item,
                  name: tUser.name,
                  email: tUser.email,
                  role: role,
                  description: role
                };
              }
            } catch (e) {
              console.error('Failed to resolve tembusan user', e);
            }
            return item;
          })
        );
      }

      // Parse content as JSON (form data for frontend template rendering)
      let contentData: Record<string, unknown> | null = null;
      if (document.content && typeof document.content === 'object') {
        contentData = document.content as Record<string, unknown>;
      }

      const detail: TembusanDetail = {
        id: document.letterInstanceId,
        documentId: document.id,
        nomorSurat: document.nomorSurat,
        perihal: document.perihal,
        tanggalSurat: document.tanggalSurat?.toISOString() || null,
        jenisDocument: document.type === 'SURAT_KEPUTUSAN' ? 'Surat Keputusan' : 'Surat Tugas',
        documentType: document.type as TembusanDetail['documentType'],
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
        content: contentData,
        submissionValues: document.letterInstance.submissionValues as Record<string, unknown>,
        contentHtml: typeof document.content === 'string' ? document.content : null,
        qrCodeUrl: document.qrCodeUrl,
        attachmentUrls: signedAttachmentUrls as unknown[] | null,
        signaturesFull,
        tembusanList: processedTembusan.map(t => ({
          userId: t.userId || undefined,
          name: t.name,
          description: t.description || undefined,
          email: t.email || undefined,
          role: t.role || undefined,
        })),
        sealImageUrl: document.sealImageUrl,
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

      // Get all letters where user is in tembusan list
      // Note: createdById no longer grants automatic tembusan access.
      // The "Pengaju Surat" checkbox controls this via __PENGAJU__ marker.
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
          tembusan: true,
          letterInstance: {
            select: { createdById: true }
          }
        }
      });

      // Resolve __PENGAJU__ marker to actual submitter (createdById)
      const allLetterIds = completedDocuments
        .filter(doc => {
          const tembusanList = parseTembusanData(doc.tembusan);
          return tembusanList.some(t => {
            if (t.userId === '__PENGAJU__') {
              return doc.letterInstance.createdById === userId;
            }
            return t.userId === userId ||
              (!t.userId && t.name.toLowerCase().includes(user.name.toLowerCase()));
          });
        })
        .map(doc => doc.letterInstanceId);

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
