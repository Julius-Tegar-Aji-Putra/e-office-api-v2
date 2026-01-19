/**
 * Pengantar Service
 * Logic generate & approval surat pengantar
 */

import { PengantarRepository } from './pengantar.repository';
import { AppError } from '../../shared/middleware/error.middleware';
import { SUBMISSION_STATUS } from '../../shared/constants/status';

export class PengantarService {
  constructor(private repository: PengantarRepository) {}

  async getSuratPengantar(user: any) {
    return this.repository.findByRole(user.role, user.userId);
  }

  async getSuratPengantarById(id: string) {
    const pengantar = await this.repository.findById(id);
    if (!pengantar) {
      throw new AppError(404, 'Surat pengantar tidak ditemukan');
    }
    return pengantar;
  }

  async generatePengantarProdi(submissionId: string, userId: string, data: any) {
    // Validasi submission exists dan status valid
    const submission = await this.repository.getSubmission(submissionId);
    if (!submission) {
      throw new AppError(404, 'Pengajuan tidak ditemukan');
    }

    if (submission.status !== SUBMISSION_STATUS.PRODI_REVIEW) {
      throw new AppError(400, 'Pengajuan tidak dalam status review Prodi');
    }

    // Generate surat pengantar
    return this.repository.create({
      submissionId,
      generatedBy: userId,
      content: data.content,
      level: 'PRODI', // Level Prodi ke Departemen
      status: 'PENDING',
    });
  }

  async approvePengantar(id: string, userId: string) {
    const pengantar = await this.getSuratPengantarById(id);

    if (pengantar.status !== 'PENDING') {
      throw new AppError(400, 'Surat pengantar sudah diproses');
    }

    return this.repository.update(id, {
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
    });
  }

  async rejectPengantar(id: string, userId: string, reason: string) {
    const pengantar = await this.getSuratPengantarById(id);

    if (pengantar.status !== 'PENDING') {
      throw new AppError(400, 'Surat pengantar sudah diproses');
    }

    return this.repository.update(id, {
      status: 'REJECTED',
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    });
  }
}
