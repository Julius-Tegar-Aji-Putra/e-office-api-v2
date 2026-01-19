/**
 * Disposisi Service
 * Logic disposisi & filtering pejabat
 */

import { DisposisiRepository } from './disposisi.repository';
import { AppError } from '../../shared/middleware/error.middleware';
import { DISPOSISI_STATUS } from '../../shared/constants/status';

export class DisposisiService {
  constructor(private repository: DisposisiRepository) {}

  async getDisposisiList(user: any) {
    return this.repository.findByUser(user.userId, user.role);
  }

  async getDisposisiById(id: string) {
    const disposisi = await this.repository.findById(id);
    if (!disposisi) {
      throw new AppError(404, 'Disposisi tidak ditemukan');
    }
    return disposisi;
  }

  async createDisposisi(userId: string, data: any) {
    // Validasi target pejabat
    const targetUser = await this.repository.getUserById(data.targetUserId);
    if (!targetUser) {
      throw new AppError(404, 'Target pejabat tidak ditemukan');
    }

    return this.repository.create({
      ...data,
      fromUserId: userId,
      status: DISPOSISI_STATUS.PENDING,
    });
  }

  async processDisposisi(id: string, userId: string, data: any) {
    const disposisi = await this.getDisposisiById(id);

    if (disposisi.targetUserId !== userId) {
      throw new AppError(403, 'Anda tidak berhak memproses disposisi ini');
    }

    if (disposisi.status !== DISPOSISI_STATUS.PENDING) {
      throw new AppError(400, 'Disposisi sudah diproses');
    }

    return this.repository.update(id, {
      status: data.action === 'accept' ? DISPOSISI_STATUS.IN_PROGRESS : DISPOSISI_STATUS.REJECTED,
      processedAt: new Date(),
      notes: data.notes,
    });
  }
}
