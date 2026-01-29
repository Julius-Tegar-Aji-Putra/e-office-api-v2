/**
 * Distribution Service
 * Service untuk mendistribusikan surat ke penerima tembusan melalui sistem internal
 * 
 * Tembusan tidak dikirim via email, melainkan muncul di dashboard/inbox akun penerima
 */

import { prisma } from '../../db';
import { LogAction } from '../../generated/prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface TembusanRecipient {
  type: 'user' | 'role';  // Apakah tembusan ke user spesifik atau role
  userId?: string;        // ID user jika type = 'user'
  role?: string;          // Role jika type = 'role' (misal: 'KAPRODI', 'DEKAN')
  name: string;           // Nama penerima (untuk display)
  unit?: string;          // Unit/departemen (opsional)
}

export interface DistributeDocumentInput {
  documentId: string;
  letterInstanceId: string;
  recipients: TembusanRecipient[];
  distributedBy: {
    userId: string;
    role: string;
  };
}

export interface DistributeResult {
  success: boolean;
  distributed: number;
  failed: number;
  details: Array<{
    recipient: string;
    success: boolean;
    error?: string;
  }>;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

class DistributionService {
  /**
   * Distribusikan dokumen ke penerima tembusan
   * 
   * Proses:
   * 1. Parse daftar tembusan dari LetterDocument
   * 2. Update flag readyToDistribute = true
   * 3. Log aktivitas distribusi
   * 4. Notifikasi bisa ditambahkan di sini (in-app notification)
   */
  async distributeDocument(input: DistributeDocumentInput): Promise<DistributeResult> {
    const { documentId, letterInstanceId, recipients, distributedBy } = input;
    const details: DistributeResult['details'] = [];
    let distributed = 0;
    let failed = 0;

    try {
      // Mark document as distributed
      await prisma.letterDocument.update({
        where: { id: documentId },
        data: {
          readyToDistribute: true,
          updatedAt: new Date(),
        },
      });

      // Log distribusi untuk setiap penerima
      for (const recipient of recipients) {
        try {
          // Log aktivitas tembusan
          await prisma.letterLog.create({
            data: {
              letterInstanceId,
              actorId: distributedBy.userId,
              actorRole: distributedBy.role,
              action: LogAction.FINALIZE,
              notes: `Tembusan dikirim ke ${recipient.name}${recipient.unit ? ` (${recipient.unit})` : ''}`,
              metadata: {
                recipientType: recipient.type,
                recipientId: recipient.userId,
                recipientRole: recipient.role,
                recipientName: recipient.name,
              },
            },
          });

          distributed++;
          details.push({
            recipient: recipient.name,
            success: true,
          });
        } catch (error) {
          failed++;
          details.push({
            recipient: recipient.name,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return {
        success: failed === 0,
        distributed,
        failed,
        details,
      };
    } catch (error) {
      console.error('Error distributing document:', error);
      return {
        success: false,
        distributed: 0,
        failed: recipients.length,
        details: recipients.map(r => ({
          recipient: r.name,
          success: false,
          error: error instanceof Error ? error.message : 'Distribution failed',
        })),
      };
    }
  }

  /**
   * Get daftar surat yang diterima sebagai tembusan untuk user tertentu
   * 
   * Query ini mencari surat yang:
   * 1. Sudah COMPLETED
   * 2. User adalah bagian dari tembusan
   * 3. readyToDistribute = true
   */
  async getReceivedDocuments(userId: string, userRole: string) {
    // Get documents where user is in tembusan list
    const documents = await prisma.letterDocument.findMany({
      where: {
        readyToDistribute: true,
        letterInstance: {
          status: 'COMPLETED',
        },
        // Check if user is in tembusan - this depends on how tembusan JSON is structured
        // For now, we use logs to track who received tembusan
      },
      include: {
        letterInstance: {
          include: {
            letterType: true,
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true,
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
        updatedAt: 'desc',
      },
    });

    return documents;
  }

  /**
   * Parse tembusan JSON dari document menjadi array TembusanRecipient
   */
  parseTembusanData(tembusanJson: unknown): TembusanRecipient[] {
    if (!tembusanJson) return [];

    // Handle various formats
    if (Array.isArray(tembusanJson)) {
      return tembusanJson.map((item) => {
        if (typeof item === 'string') {
          return {
            type: 'role' as const,
            name: item,
          };
        }
        return {
          type: item.type || 'role',
          userId: item.userId,
          role: item.role,
          name: item.name || item.role || 'Unknown',
          unit: item.unit,
        };
      });
    }

    return [];
  }

  /**
   * Resolve recipients - convert role-based tembusan to actual user IDs
   * Misal: "KAPRODI" -> cari user dengan role KAPRODI di departemen terkait
   */
  async resolveRecipients(
    recipients: TembusanRecipient[],
    context: { departemenId?: string; programStudiId?: string }
  ): Promise<TembusanRecipient[]> {
    const resolved: TembusanRecipient[] = [];

    for (const recipient of recipients) {
      if (recipient.type === 'user' && recipient.userId) {
        // Already a specific user
        resolved.push(recipient);
      } else if (recipient.type === 'role' && recipient.role) {
        // Find user with this role
        // This is a simplified implementation - adjust based on your role structure
        const users = await prisma.userRole.findMany({
          where: {
            role: {
              name: recipient.role,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        for (const userRole of users) {
          resolved.push({
            type: 'user',
            userId: userRole.user.id,
            name: userRole.user.name,
            role: recipient.role,
          });
        }
      } else {
        // Just a name/label, add as-is
        resolved.push(recipient);
      }
    }

    return resolved;
  }
}

export const distributionService = new DistributionService();
