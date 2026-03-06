/**
 * Faculty Disposition Repository
 * Data access layer untuk modul disposisi fakultas
 * 
 * PERBAIKAN LOGIC RETURN:
 * - Return ke ADMIN_PRODI = DEAD END (surat selesai/rejected)
 * - Return ke ADMIN_FAKULTAS = surat bisa lanjut lagi
 * - Return ke Pejabat lain = disposisi lanjut
 */

import { prisma } from '../../db';
import { Prisma, LetterStatus, LogAction, LetterCategory, DocumentType } from '../../generated/prisma/client';
import { formatRoleForLog } from '../../shared/constants/roles';

// ============================================================================
// TYPES
// ============================================================================

export interface DispositionListParams {
  page?: number;
  limit?: number;
  status?: LetterStatus;
  category?: LetterCategory;
  search?: string;
}

export interface DispositionInput {
  letterId: string;
  targetRole: string;
  targetUserId?: string;
  notes?: string;
}

export interface ReturnInput {
  letterId: string;
  targetRole: string;
  targetUserId?: string;
  reason: string;
}

export interface CompleteInput {
  letterId: string;
  notes: string;
}

// ============================================================================
// REPOSITORY CLASS
// ============================================================================

class FacultyDispositionRepository {
  /**
   * Get incoming letters for Admin Fakultas (status: SURAT_PENGANTAR_SIGNED)
   */
  async getIncomingLettersForAdmin(params: DispositionListParams) {
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
    params: DispositionListParams
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
   * Get disposition history actors (untuk return targets)
   * Returns unique roles yang pernah handle surat ini di level fakultas
   * 
   * PERBAIKAN: Ambil SEMUA role yang pernah melakukan aksi terhadap surat
   * termasuk DISPOSITION, RETURN, STATUS_CHANGE, APPROVE, VERIFY
   */
  async getDispositionHistoryActors(letterId: string): Promise<string[]> {
    const logs = await prisma.letterLog.findMany({
      where: {
        letterInstanceId: letterId,
        action: {
          in: [
            LogAction.DISPOSITION,
            LogAction.RETURN,
            LogAction.STATUS_CHANGE,
            LogAction.APPROVE,
            LogAction.VERIFY
          ]
        },
        // Hanya ambil yang terkait level fakultas
        actorRole: {
          in: [
            'ADMIN_FAKULTAS',
            'DEKAN',
            'WADEK_1',
            'WADEK_2',
            'MANAJER_TU',
            'SUPERVISOR_AKADEMIK',
            'SUPERVISOR_SUMBER_DAYA',
            'STAF_AKADEMIK',
            'STAF_SUMBER_DAYA'
          ]
        }
      },
      select: { actorRole: true },
      distinct: ['actorRole']
    });

    return logs.map(log => log.actorRole);
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

      // Update to FAKULTAS_RECEIVED and save category
      const updatedLetter = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.FAKULTAS_RECEIVED,
          currentActiveRole: 'ADMIN_FAKULTAS',
          category: category,
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
    input: DispositionInput,
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
          currentActiveUserId: input.targetUserId || null,
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
          notes: input.notes || `Disposisi ke ${formatRoleForLog(input.targetRole)}`
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
   * Return letter to previous role
   * 
   * PERBAIKAN LOGIC:
   * - Return ke ADMIN_PRODI = DEAD END (status COMPLETED dengan flag rejected)
   * - Return ke ADMIN_FAKULTAS = FAKULTAS_RECEIVED (bisa lanjut)
   * - Return ke Pejabat lain = FAKULTAS_DISPOSITION (lanjut disposisi)
   */
  async returnLetter(
    input: ReturnInput,
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      let newStatus: LetterStatus;
      let newActiveRole: string | null = input.targetRole;

      // PERBAIKAN: Jika dikembalikan ke Admin Prodi, surat berhenti (DEAD END)
      if (input.targetRole === 'ADMIN_PRODI') {
        // Surat selesai/rejected - dikembalikan ke prodi tanpa tindak lanjut
        newStatus = LetterStatus.COMPLETED;
        newActiveRole = null; // Tidak ada yang perlu action lagi
      } else if (input.targetRole === 'ADMIN_FAKULTAS') {
        // Dikembalikan ke Admin Fakultas - masih bisa lanjut
        newStatus = LetterStatus.FAKULTAS_RECEIVED;
      } else {
        // Dikembalikan ke pejabat lain - lanjut disposisi
        newStatus = LetterStatus.FAKULTAS_DISPOSITION;
      }

      const letter = await tx.letterInstance.update({
        where: { id: input.letterId },
        data: {
          status: newStatus,
          currentActiveRole: newActiveRole,
          currentActiveUserId: input.targetUserId || null,
          ...(input.targetRole === 'ADMIN_PRODI' && {
            completedAt: new Date() // Mark as completed
          }),
          updatedAt: new Date()
        }
      });

      // Create return log dengan catatan pengembalian
      await tx.letterLog.create({
        data: {
          letterInstanceId: input.letterId,
          actorId,
          actorRole,
          action: LogAction.RETURN,
          fromStatus: LetterStatus.FAKULTAS_DISPOSITION,
          toStatus: newStatus,
          targetRole: input.targetRole,
          notes: input.reason, // Catatan pengembalian WAJIB
          metadata: {
            returnReason: input.reason,
            returnedTo: input.targetRole,
            isDeadEnd: input.targetRole === 'ADMIN_PRODI'
          }
        }
      });

      return letter;
    });
  }

  /**
   * Final disposition to staff for drafting
   * 
   * PERBAIKAN LOGIC LEAK:
   * - Status berubah ke SURAT_DIBUAT (bukan FAKULTAS_DRAFTING)
   * - Log disposisi ini adalah PENUTUP Surat Masuk
   * - Surat Keluar akan dimulai fresh saat staff membuat draft
   */
  async dispositionToStaff(
    letterId: string,
    staffRole: string,
    actorId: string,
    actorRole: string,
    notes?: string,
    targetUserId?: string
  ) {
    return prisma.$transaction(async (tx) => {
      // Update status ke SURAT_DIBUAT (penutup Surat Masuk)
      const letter = await tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: LetterStatus.SURAT_DIBUAT,
          currentActiveRole: staffRole,
          currentActiveUserId: targetUserId || null,
          updatedAt: new Date()
        }
      });

      // Log disposisi sebagai PENUTUP timeline Surat Masuk
      await tx.letterLog.create({
        data: {
          letterInstanceId: letterId,
          actorId,
          actorRole,
          action: LogAction.DISPOSITION,
          fromStatus: LetterStatus.FAKULTAS_DISPOSITION,
          toStatus: LetterStatus.SURAT_DIBUAT,
          targetRole: staffRole,
          notes: notes || `Disposisi ke ${formatRoleForLog(staffRole)} untuk drafting`
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

export const facultyDispositionRepository = new FacultyDispositionRepository();
