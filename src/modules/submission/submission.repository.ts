/**
 * Submission Repository
 * Database access layer untuk modul pengajuan surat
 */

import { prisma } from '../../db';
import { Prisma } from '../../generated/prisma/client';
import type { LetterStatus, LetterCategory, LogAction } from '../../generated/prisma/enums';
import type { SubmissionFilter, SubmissionSort, CreateSubmissionDTO } from './submission.types';

// ============================================================================
// Repository Class
// ============================================================================

export class SubmissionRepository {
  /**
   * Get all letter types with active templates
   */
  async getLetterTypes() {
    return prisma.letterType.findMany({
      where: { deletedAt: null },
      include: {
        templates: {
          where: { isActive: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get letter type by ID with active template
   */
  async getLetterTypeById(id: string) {
    return prisma.letterType.findUnique({
      where: { id, deletedAt: null },
      include: {
        templates: {
          where: { isActive: true },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Find submissions by creator
   */
  async findByCreator(
    createdById: string,
    filter: SubmissionFilter,
    sort: SubmissionSort,
    pagination: { skip: number; take: number }
  ) {
    const where = this.buildWhereClause({ ...filter, createdById });

    const [items, total] = await Promise.all([
      prisma.letterInstance.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: this.buildOrderBy(sort),
        include: {
          letterType: {
            select: { id: true, name: true, code: true, category: true },
          },
          documents: {
            select: { type: true, nomorSurat: true, isSigned: true, fileUrl: true },
          },
        },
      }),
      prisma.letterInstance.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Find submission by ID with full relations
   */
  async findById(id: string) {
    return prisma.letterInstance.findUnique({
      where: { id },
      include: {
        letterType: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
            category: true,
            requiresPengantar: true,
            requiresDekanSign: true,
            requiresWadekSign: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            mahasiswa: {
              select: { nim: true, departemen: { select: { name: true } }, programStudi: { select: { name: true } } },
            },
            pegawai: {
              select: { nip: true, jabatan: true, departemen: { select: { name: true } }, programStudi: { select: { name: true } } },
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
        attachments: {
          orderBy: { uploadedAt: 'desc' },
        },
        logs: {
          orderBy: { createdAt: 'desc' },
          include: {
            actor: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
  }

  /**
   * Create new submission with initial log
   */
  async create(data: {
    letterTypeId: string;
    createdById: string;
    submissionValues: Record<string, unknown>;
    signatureConfig: Record<string, unknown>;
    status: LetterStatus;
    currentActiveRole: string;
  }) {
    return prisma.$transaction(async (tx) => {
      // Create letter instance
      const letterInstance = await tx.letterInstance.create({
        data: {
          letterTypeId: data.letterTypeId,
          createdById: data.createdById,
          submissionValues: data.submissionValues as any,
          signatureConfig: data.signatureConfig as any,
          status: data.status,
          currentActiveRole: data.currentActiveRole,
        },
        include: {
          letterType: true,
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Create initial log
      await tx.letterLog.create({
        data: {
          letterInstanceId: letterInstance.id,
          actorId: data.createdById,
          actorRole: 'PENGAJU',
          action: 'SUBMIT' as LogAction,
          toStatus: data.status,
          notes: 'Pengajuan surat baru',
        },
      });

      return letterInstance;
    });
  }

  /**
   * Update submission values (for revision)
   */
  async updateSubmissionValues(
    id: string,
    data: {
      submissionValues: Record<string, unknown>;
      signatureConfig?: Record<string, unknown>;
    },
    actorId: string,
    actorRole: string
  ) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.letterInstance.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!current) throw new Error('Submission not found');

      const updated = await tx.letterInstance.update({
        where: { id },
        data: {
          submissionValues: data.submissionValues as any,
          ...(data.signatureConfig && { signatureConfig: data.signatureConfig as any }),
        },
        include: {
          letterType: true,
          createdBy: { select: { id: true, name: true, email: true } },
        },
      });

      // Log update
      await tx.letterLog.create({
        data: {
          letterInstanceId: id,
          actorId,
          actorRole,
          action: 'RESUBMIT' as LogAction,
          fromStatus: current.status,
          toStatus: current.status,
          notes: 'Revisi data pengajuan',
        },
      });

      return updated;
    });
  }

  /**
   * Cancel submission
   */
  async cancel(id: string, actorId: string, alasan?: string) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.letterInstance.findUnique({
        where: { id },
        select: { status: true, createdById: true },
      });

      if (!current) throw new Error('Submission not found');
      if (current.createdById !== actorId) throw new Error('Not authorized');

      const updated = await tx.letterInstance.update({
        where: { id },
        data: {
          status: 'CANCELLED' as LetterStatus,
          currentActiveRole: null,
        },
      });

      await tx.letterLog.create({
        data: {
          letterInstanceId: id,
          actorId,
          actorRole: 'PENGAJU',
          action: 'STATUS_CHANGE' as LogAction,
          fromStatus: current.status,
          toStatus: 'CANCELLED' as LetterStatus,
          notes: alasan || 'Dibatalkan oleh pengaju',
        },
      });

      return updated;
    });
  }

  /**
   * Add attachment to submission
   */
  async addAttachment(data: {
    letterInstanceId: string;
    fileName: string;
    fileUrl: string;
    fileSize?: number;
    mimeType?: string;
    description?: string;
    uploadedById: string;
  }) {
    return prisma.letterAttachment.create({
      data: {
        letterInstanceId: data.letterInstanceId,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        description: data.description,
        uploadedById: data.uploadedById,
      },
    });
  }

  /**
   * Remove attachment
   */
  async removeAttachment(id: string, letterInstanceId: string) {
    return prisma.letterAttachment.delete({
      where: { id, letterInstanceId },
    });
  }

  /**
   * Get attachments for submission
   */
  async getAttachments(letterInstanceId: string) {
    return prisma.letterAttachment.findMany({
      where: { letterInstanceId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  /**
   * Check if user owns submission
   */
  async isOwner(letterInstanceId: string, userId: string): Promise<boolean> {
    const submission = await prisma.letterInstance.findUnique({
      where: { id: letterInstanceId },
      select: { createdById: true },
    });
    return submission?.createdById === userId;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private buildWhereClause(filter: SubmissionFilter & { createdById?: string }): Prisma.LetterInstanceWhereInput {
    const where: Prisma.LetterInstanceWhereInput = {};

    if (filter.createdById) {
      where.createdById = filter.createdById;
    }

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.letterTypeId) {
      where.letterTypeId = filter.letterTypeId;
    }

    if (filter.category) {
      where.letterType = { category: filter.category };
    }

    if (filter.search) {
      where.OR = [
        {
          submissionValues: {
            path: ['judulAcara'],
            string_contains: filter.search,
          },
        },
        {
          submissionValues: {
            path: ['keperluan'],
            string_contains: filter.search,
          },
        },
      ];
    }

    if (filter.dateFrom || filter.dateTo) {
      where.submittedAt = {};
      if (filter.dateFrom) {
        where.submittedAt.gte = filter.dateFrom;
      }
      if (filter.dateTo) {
        where.submittedAt.lte = filter.dateTo;
      }
    }

    return where;
  }

  private buildOrderBy(sort: SubmissionSort): Prisma.LetterInstanceOrderByWithRelationInput {
    const orderMap: Record<string, Prisma.LetterInstanceOrderByWithRelationInput> = {
      submittedAt: { submittedAt: sort.order },
      status: { status: sort.order },
      // Note: judulSurat is in JSON, complex ordering would need raw query
      judulSurat: { submittedAt: sort.order }, // Fallback to submittedAt
    };

    return orderMap[sort.field] || { submittedAt: 'desc' };
  }
}

// Singleton instance
export const submissionRepository = new SubmissionRepository();
