/**
 * Disposisi Repository
 * Data access layer untuk modul disposisi fakultas
 */

import { prisma } from '../../db';
import { Prisma, LetterStatus, LogAction, LetterCategory } from '../../generated/prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface DisposisiListParams {
  page?: number;
  limit?: number;
  status?: LetterStatus;
  category?: LetterCategory;
  search?: string;
}

export interface DisposisiInput {
  letterId: string;
  targetRole: string;
  notes?: string;
}

export interface ReturnInput {
  letterId: string;
  targetRole: string;
  reason: string;
}

export interface CompleteInput {
  letterId: string;
  notes: string;
}

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

class DisposisiRepository {
  /**
   * Get incoming letters for Admin Fakultas (status: SURAT_PENGANTAR_SIGNED)
   */
  async getIncomingLettersForAdmin(params: DisposisiListParams) {
    const { page = 1, limit = 10, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.LetterInstanceWhereInput = {
      status: LetterStatus.SURAT_PENGANTAR_SIGNED,
      currentActiveRole: 'ADMIN_FAKULTAS',
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
              mahasiswa: { include: { programStudi: true, departemen: true } },
              pegawai: { include: { programStudi: true, departemen: true } }
            }
          },
          documents: true,
          logs: {
            orderBy: { createdAt: 'desc' },
            take: 5
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
   * Get letters in disposition for pejabat (status: FAKULTAS_DISPOSITION)
   */
  async getLettersForDisposition(
    userRole: string,
    params: DisposisiListParams
  ) {
    const { page = 1, limit = 10, category, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.LetterInstanceWhereInput = {
      status: LetterStatus.FAKULTAS_DISPOSITION,
      currentActiveRole: userRole,
      ...(category && {
        letterType: { category }
      }),
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
   * Admin Fakultas receives letter and assigns category -> FAKULTAS_RECEIVED
   */
  async receiveAndCategorize(
    letterId: string,
    category: LetterCategory,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Update letter type category if needed
      const letter = await tx.letterInstance.findUnique({
        where: { id: letterId },
        include: { letterType: true }
      });

      if (!letter) throw new Error('Letter not found');

      // Update to FAKULTAS_RECEIVED
      const updatedLetter = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.FAKULTAS_RECEIVED,
          currentActiveRole: 'ADMIN_FAKULTAS',
          updatedAt: new Date()
        }
      });

      // Store category in metadata or use existing letterType
      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.STATUS_CHANGE,
          fromStatus: LetterStatus.SURAT_PENGANTAR_SIGNED,
          toStatus: LetterStatus.FAKULTAS_RECEIVED,
          notes: `Surat diterima, dikategorikan sebagai ${category}`,
          metadata: { category }
        }
      });

      return updatedLetter;
    });
  }

  /**
   * Admin/Pejabat disposisi to next role
   */
  async createDisposition(
    input: DisposisiInput,
    actorId: string,
    actorRole: string,
    fromStatus: LetterStatus
  ) {
    return prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.update({
        where: { id: input.letterId },
        data: {
          status: LetterStatus.FAKULTAS_DISPOSITION,
          currentActiveRole: input.targetRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: input.letterId,
          actorId,
          actorRole,
          action: LogAction.DISPOSITION,
          fromStatus,
          toStatus: LetterStatus.FAKULTAS_DISPOSITION,
          targetRole: input.targetRole,
          notes: input.notes || `Disposisi ke ${input.targetRole}`
        }
      });

      return letter;
    });
  }

  /**
   * Pejabat marks as complete (selesai tanpa output ST/SK)
   */
  async markAsComplete(
    input: CompleteInput,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.update({
        where: { id: input.letterId },
        data: {
          status: LetterStatus.COMPLETED,
          currentActiveRole: null,
          completedAt: new Date(),
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: input.letterId,
          actorId,
          actorRole,
          action: LogAction.STATUS_CHANGE,
          fromStatus: LetterStatus.FAKULTAS_DISPOSITION,
          toStatus: LetterStatus.COMPLETED,
          notes: input.notes,
          metadata: { completedBy: actorRole, reason: input.notes }
        }
      });

      return letter;
    });
  }

  /**
   * Return letter to previous role/Admin Prodi
   */
  async returnLetter(
    input: ReturnInput,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Determine new status based on target
      let newStatus: LetterStatus;
      if (input.targetRole === 'ADMIN_PRODI') {
        newStatus = LetterStatus.SURAT_PENGANTAR_DRAFT; // Return to prodi for revision
      } else if (input.targetRole === 'ADMIN_FAKULTAS') {
        newStatus = LetterStatus.FAKULTAS_RECEIVED;
      } else {
        newStatus = LetterStatus.FAKULTAS_DISPOSITION;
      }

      const letter = await tx.letterInstance.update({
        where: { id: input.letterId },
        data: {
          status: newStatus,
          currentActiveRole: input.targetRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: input.letterId,
          actorId,
          actorRole,
          action: LogAction.RETURN,
          fromStatus: LetterStatus.FAKULTAS_DISPOSITION,
          toStatus: newStatus,
          targetRole: input.targetRole,
          notes: input.reason,
          metadata: { returnReason: input.reason }
        }
      });

      return letter;
    });
  }

  /**
   * Final disposition to staff for drafting
   */
  async dispositionToStaff(
    letterId: string,
    staffRole: string,
    actorId: string,
    actorRole: string,
    notes?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.FAKULTAS_DRAFTING,
          currentActiveRole: staffRole,
          updatedAt: new Date()
        }
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.DISPOSITION,
          fromStatus: LetterStatus.FAKULTAS_DISPOSITION,
          toStatus: LetterStatus.FAKULTAS_DRAFTING,
          targetRole: staffRole,
          notes: notes || `Disposisi ke ${staffRole} untuk drafting`
        }
      });

      return letter;
    });
  }

  /**
   * Get users by role for disposition dropdown
   */
  async getUsersByRole(role: string) {
    // Get role ID first
    const roleRecord = await prisma.role.findUnique({
      where: { name: role }
    });

    if (!roleRecord) return [];

    return prisma.user.findMany({
      where: {
        userRoles: {
          some: { roleId: roleRecord.id }
        },
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        email: true,
        pegawai: {
          select: {
            nip: true,
            jabatan: true
          }
        }
      }
    });
  }
}

export const disposisiRepository = new DisposisiRepository();
