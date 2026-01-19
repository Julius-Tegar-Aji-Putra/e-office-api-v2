/**
 * Submission Service
 * Business logic pengajuan surat & validasi status
 */

import { SubmissionRepository } from './submission.repository';
import { AppError } from '../../shared/middleware/error.middleware';
import { SUBMISSION_STATUS } from '../../shared/constants/status';
import { createPaginationMeta } from '../../shared/utils/pagination.util';

export class SubmissionService {
  constructor(private repository: SubmissionRepository) {}

  async getSubmissions(userId: string, params: { page: number; limit: number }) {
    const { submissions, total } = await this.repository.findMany(userId, params);
    const meta = createPaginationMeta(params.page, params.limit, total);
    
    return { data: submissions, meta };
  }

  async getSubmissionById(id: string) {
    const submission = await this.repository.findById(id);
    if (!submission) {
      throw new AppError(404, 'Pengajuan tidak ditemukan');
    }
    return submission;
  }

  async createSubmission(userId: string, data: any) {
    return this.repository.create({
      ...data,
      userId,
      status: SUBMISSION_STATUS.DRAFT,
    });
  }

  async updateSubmission(id: string, data: any) {
    const submission = await this.getSubmissionById(id);
    
    // Validasi: hanya draft yang bisa diupdate
    if (submission.status !== SUBMISSION_STATUS.DRAFT) {
      throw new AppError(400, 'Hanya pengajuan dengan status Draft yang dapat diubah');
    }
    
    return this.repository.update(id, data);
  }

  async submitSubmission(id: string) {
    const submission = await this.getSubmissionById(id);
    
    // Validasi: hanya draft yang bisa disubmit
    if (submission.status !== SUBMISSION_STATUS.DRAFT) {
      throw new AppError(400, 'Pengajuan ini sudah disubmit');
    }
    
    return this.repository.update(id, {
      status: SUBMISSION_STATUS.SUBMITTED,
      submittedAt: new Date(),
    });
  }

  async deleteSubmission(id: string) {
    const submission = await this.getSubmissionById(id);
    
    // Validasi: hanya draft yang bisa dihapus
    if (submission.status !== SUBMISSION_STATUS.DRAFT) {
      throw new AppError(400, 'Hanya pengajuan dengan status Draft yang dapat dihapus');
    }
    
    return this.repository.delete(id);
  }
}
