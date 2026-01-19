/**
 * Leadership Types
 * Type khusus pimpinan
 */

export interface LeadershipApproval {
  id: string;
  submissionId: string;
  approvedBy: string;
  notes?: string;
  createdAt: Date;
}

export interface LeadershipRejection {
  id: string;
  submissionId: string;
  rejectedBy: string;
  reason: string;
  createdAt: Date;
}
