/**
 * Leadership Repository
 * DB access untuk approval pimpinan
 */

import { prisma } from '../../config/database';
import { SUBMISSION_STATUS } from '../../shared/constants/status';

export class LeadershipRepository {
  async findPendingForLeader(role: string) {
    return prisma.submission.findMany({
      where: {
        status: SUBMISSION_STATUS.FAKULTAS_REVIEW,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        letterType: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getSubmission(id: string) {
    return prisma.submission.findUnique({
      where: { id },
    });
  }

  async updateSubmission(id: string, data: any) {
    return prisma.submission.update({
      where: { id },
      data,
    });
  }

  async createApproval(data: any) {
    return prisma.approval.create({
      data,
    });
  }

  async createRejection(data: any) {
    return prisma.rejection.create({
      data,
    });
  }

  async createDisposisi(data: any) {
    return prisma.disposisi.create({
      data,
    });
  }
}
