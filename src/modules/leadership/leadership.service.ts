/**
 * Leadership Service
 * Logic verifikasi / tolak / disposisi ulang
 */

import { LeadershipRepository } from './leadership.repository';
import { AppError } from '../../shared/middleware/error.middleware';
import { SUBMISSION_STATUS } from '../../shared/constants/status';

export class LeadershipService {
  constructor(private repository: LeadershipRepository) {}

  async getPendingApprovals(user: any) {
    // Filter berdasarkan role pimpinan
    return this.repository.findPendingForLeader(user.role);
  }

  async approveSubmission(submissionId: string, userId: string, data: any) {
    const submission = await this.repository.getSubmission(submissionId);
    if (!submission) {
      throw new AppError(404, 'Pengajuan tidak ditemukan');
    }

    if (submission.status !== SUBMISSION_STATUS.FAKULTAS_REVIEW) {
      throw new AppError(400, 'Status pengajuan tidak valid untuk approval');
    }

    // Create approval record
    await this.repository.createApproval({
      submissionId,
      approvedBy: userId,
      notes: data.notes,
    });

    // Update submission status
    return this.repository.updateSubmission(submissionId, {
      status: SUBMISSION_STATUS.FAKULTAS_APPROVED,
    });
  }

  async rejectSubmission(submissionId: string, userId: string, reason: string) {
    const submission = await this.repository.getSubmission(submissionId);
    if (!submission) {
      throw new AppError(404, 'Pengajuan tidak ditemukan');
    }

    await this.repository.createRejection({
      submissionId,
      rejectedBy: userId,
      reason,
    });

    return this.repository.updateSubmission(submissionId, {
      status: SUBMISSION_STATUS.FAKULTAS_REJECTED,
    });
  }

  async redisposeSubmission(submissionId: string, userId: string, data: any) {
    // Create new disposisi
    return this.repository.createDisposisi({
      submissionId,
      fromUserId: userId,
      targetUserId: data.targetUserId,
      message: data.message,
    });
  }
}
