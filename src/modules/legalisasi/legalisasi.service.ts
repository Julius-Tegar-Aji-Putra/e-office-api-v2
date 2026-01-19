/**
 * Legalisasi Service
 * Logic penomoran, cap, distribusi
 */

import { LegalisasiRepository } from './legalisasi.repository';
import { AppError } from '../../shared/middleware/error.middleware';

export class LegalisasiService {
  constructor(private repository: LegalisasiRepository) {}

  async getPendingLegalisasi() {
    return this.repository.findPendingLegalisasi();
  }

  async getLegalisasiById(id: string) {
    const legalisasi = await this.repository.findById(id);
    if (!legalisasi) {
      throw new AppError(404, 'Legalisasi tidak ditemukan');
    }
    return legalisasi;
  }

  async processLegalisasi(suratHasilId: string, userId: string, data: any) {
    const suratHasil = await this.repository.getSuratHasil(suratHasilId);
    if (!suratHasil) {
      throw new AppError(404, 'Surat hasil tidak ditemukan');
    }

    if (suratHasil.status !== 'SIGNED_COMPLETE') {
      throw new AppError(400, 'Surat belum selesai ditandatangani');
    }

    // Generate nomor surat
    const nomorSurat = await this.generateNomorSurat();

    // Create legalisasi record
    return this.repository.create({
      suratHasilId,
      processedBy: userId,
      nomorSurat,
      stampedAt: new Date(),
      notes: data.notes,
    });
  }

  async distributeSurat(legalisasiId: string, userId: string, data: any) {
    const legalisasi = await this.getLegalisasiById(legalisasiId);

    return this.repository.update(legalisasiId, {
      distributedBy: userId,
      distributedAt: new Date(),
      distributionMethod: data.method,
      recipientInfo: data.recipient,
    });
  }

  async getArchivedDocuments() {
    return this.repository.findArchived();
  }

  private async generateNomorSurat(): Promise<string> {
    // Logic untuk generate nomor surat
    // Format: XXX/UPA/FAKULTAS/BULAN/TAHUN
    const count = await this.repository.getCountThisMonth();
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    
    return `${String(count + 1).padStart(3, '0')}/UPA/FT/${month}/${year}`;
  }
}
