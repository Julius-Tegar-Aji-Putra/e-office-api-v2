/**
 * Disposisi Repository
 * DB disposisi & histori
 */

import { prisma } from '../../config/database';

export class DisposisiRepository {
  async findByUser(userId: string, role: string) {
    return prisma.disposisi.findMany({
      where: {
        OR: [
          { fromUserId: userId },
          { targetUserId: userId },
        ],
      },
      include: {
        fromUser: { select: { id: true, name: true, role: true } },
        targetUser: { select: { id: true, name: true, role: true } },
        submission: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return prisma.disposisi.findUnique({
      where: { id },
      include: {
        fromUser: true,
        targetUser: true,
        submission: true,
      },
    });
  }

  async getUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: any) {
    return prisma.disposisi.create({
      data,
      include: {
        targetUser: true,
      },
    });
  }

  async update(id: string, data: any) {
    return prisma.disposisi.update({
      where: { id },
      data,
    });
  }
}
