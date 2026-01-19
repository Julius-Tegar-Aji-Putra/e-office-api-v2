/**
 * Submission Repository
 * Akses database untuk CRUD submission
 */

import { prisma } from '../../config/database';
import { getPrismaSkipTake } from '../../shared/utils/pagination.util';

export class SubmissionRepository {
  async findMany(userId: string, params: { page: number; limit: number }) {
    const { skip, take } = getPrismaSkipTake(params.page, params.limit);
    
    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where: { userId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          letterType: true,
        },
      }),
      prisma.submission.count({ where: { userId } }),
    ]);
    
    return { submissions, total };
  }

  async findById(id: string) {
    return prisma.submission.findUnique({
      where: { id },
      include: {
        user: true,
        letterType: true,
      },
    });
  }

  async create(data: any) {
    return prisma.submission.create({
      data,
      include: {
        user: true,
        letterType: true,
      },
    });
  }

  async update(id: string, data: any) {
    return prisma.submission.update({
      where: { id },
      data,
      include: {
        user: true,
        letterType: true,
      },
    });
  }

  async delete(id: string) {
    return prisma.submission.delete({
      where: { id },
    });
  }
}
