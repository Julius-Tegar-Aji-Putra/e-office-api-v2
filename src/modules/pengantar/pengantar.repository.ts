/**
 * Pengantar Repository
 * DB access untuk surat pengantar
 */

import { prisma } from '../../config/database';

export class PengantarRepository {
  async findByRole(role: string, userId: string) {
    // Logic untuk filter berdasarkan role
    const where: any = {};
    
    if (role === 'Kaprodi' || role === 'Sekprodi') {
      where.level = 'PRODI';
    } else if (role === 'Kadep' || role === 'Sekdep') {
      where.level = 'DEPT';
    }

    return prisma.suratPengantar.findMany({
      where,
      include: {
        submission: true,
        generatedByUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return prisma.suratPengantar.findUnique({
      where: { id },
      include: {
        submission: true,
        generatedByUser: true,
        approvedByUser: true,
      },
    });
  }

  async getSubmission(id: string) {
    return prisma.submission.findUnique({
      where: { id },
    });
  }

  async create(data: any) {
    return prisma.suratPengantar.create({
      data,
      include: {
        submission: true,
      },
    });
  }

  async update(id: string, data: any) {
    return prisma.suratPengantar.update({
      where: { id },
      data,
    });
  }
}
