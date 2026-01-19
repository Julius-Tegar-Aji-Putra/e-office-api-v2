/**
 * Hasil Service
 * Logic generate & workflow tanda tangan
 */

import { HasilRepository } from './hasil.repository';
import { AppError } from '../../shared/middleware/error.middleware';
import { SIGNATURE_STATUS, SUBMISSION_STATUS } from '../../shared/constants/status';
import { processSignatureFlow } from './signature.flow';

export class HasilService {
  constructor(private repository: HasilRepository) {}

  async getSuratHasilList(user: any) {
    return this.repository.findByUser(user.userId, user.role);
  }

  async getSuratHasilById(id: string) {
    const hasil = await this.repository.findById(id);
    if (!hasil) {
      throw new AppError(404, 'Surat hasil tidak ditemukan');
    }
    return hasil;
  }

  async generateSuratHasil(submissionId: string, userId: string, data: any) {
    const submission = await this.repository.getSubmission(submissionId);
    if (!submission) {
      throw new AppError(404, 'Pengajuan tidak ditemukan');
    }

    if (submission.status !== SUBMISSION_STATUS.FAKULTAS_APPROVED) {
      throw new AppError(400, 'Pengajuan belum disetujui fakultas');
    }

    // Generate surat hasil
    const hasil = await this.repository.create({
      submissionId,
      generatedBy: userId,
      content: data.content,
      documentUrl: data.documentUrl,
    });

    // Setup signature queue (berurutan)
    await this.repository.createSignatureQueue(hasil.id, data.signers);

    return hasil;
  }

  async signDocument(id: string, userId: string, data: any) {
    const hasil = await this.getSuratHasilById(id);
    
    // Validasi: apakah user adalah signer yang tepat (BERURUTAN)
    const currentSigner = await this.repository.getCurrentSigner(id);
    if (!currentSigner || currentSigner.userId !== userId) {
      throw new AppError(403, 'Anda bukan signer yang ditentukan atau bukan giliran Anda');
    }

    if (currentSigner.status !== SIGNATURE_STATUS.PENDING) {
      throw new AppError(400, 'Tanda tangan sudah diproses');
    }

    // Update signature
    await this.repository.updateSignature(currentSigner.id, {
      status: SIGNATURE_STATUS.SIGNED,
      signedAt: new Date(),
      signatureUrl: data.signatureUrl,
    });

    // Process next in queue using signature flow logic
    return processSignatureFlow(id, this.repository);
  }

  async getSignatureQueue(id: string) {
    return this.repository.getSignatureQueue(id);
  }
}
