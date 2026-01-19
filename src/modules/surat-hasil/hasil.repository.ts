/**
 * Hasil Repository
 * DB surat hasil
 */

import { prisma } from '../../config/database';
import { SIGNATURE_STATUS } from '../../shared/constants/status';

export class HasilRepository {
  async findByUser(userId: string, role: string) {
    return prisma.suratHasil.findMany({
      where: {
        OR: [
          { generatedBy: userId },
          { signatures: { some: { userId } } },
        ],
      },
      include: {
        submission: true,
        signatures: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return prisma.suratHasil.findUnique({
      where: { id },
      include: {
        submission: true,
        signatures: {
          include: { user: true },
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async getSubmission(id: string) {
    return prisma.submission.findUnique({ where: { id } });
  }

  async create(data: any) {
    return prisma.suratHasil.create({
      data,
    });
  }

  async createSignatureQueue(suratHasilId: string, signers: any[]) {
    const signatures = signers.map((signer, index) => ({
      suratHasilId,
      userId: signer.userId,
      order: index + 1,
      status: index === 0 ? SIGNATURE_STATUS.PENDING : SIGNATURE_STATUS.PENDING,
    }));

    return prisma.signature.createMany({
      data: signatures,
    });
  }

  async getCurrentSigner(suratHasilId: string) {
    return prisma.signature.findFirst({
      where: {
        suratHasilId,
        status: SIGNATURE_STATUS.PENDING,
      },
      orderBy: { order: 'asc' },
    });
  }

  async updateSignature(id: string, data: any) {
    return prisma.signature.update({
      where: { id },
      data,
    });
  }

  async getSignatureQueue(suratHasilId: string) {
    return prisma.signature.findMany({
      where: { suratHasilId },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { order: 'asc' },
    });
  }

  async updateSuratHasil(id: string, data: any) {
    return prisma.suratHasil.update({
      where: { id },
      data,
    });
  }
}
