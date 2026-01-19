/**
 * Legalisasi Repository
 * DB penomoran & arsip
 */

import { prisma } from '../../config/database';

export class LegalisasiRepository {
  async findPendingLegalisasi() {
    return prisma.suratHasil.findMany({
      where: {
        status: 'SIGNED_COMPLETE',
        legalisasi: null,
      },
      include: {
        submission: {
          include: {
            user: { select: { id: true, name: true } },
            letterType: true,
          },
        },
      },
      orderBy: { completedAt: 'asc' },
    });
  }

  async findById(id: string) {
    return prisma.legalisasi.findUnique({
      where: { id },
      include: {
        suratHasil: {
          include: {
            submission: true,
          },
        },
        processedByUser: { select: { id: true, name: true } },
      },
    });
  }

  async getSuratHasil(id: string) {
    return prisma.suratHasil.findUnique({
      where: { id },
    });
  }

  async create(data: any) {
    return prisma.legalisasi.create({
      data,
      include: {
        suratHasil: true,
      },
    });
  }

  async update(id: string, data: any) {
    return prisma.legalisasi.update({
      where: { id },
      data,
    });
  }

  async findArchived() {
    return prisma.legalisasi.findMany({
      where: {
        distributedAt: { not: null },
      },
      include: {
        suratHasil: {
          include: { submission: true },
        },
      },
      orderBy: { distributedAt: 'desc' },
    });
  }

  async getCountThisMonth(): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    return prisma.legalisasi.count({
      where: {
        createdAt: { gte: startOfMonth },
      },
    });
  }
}
