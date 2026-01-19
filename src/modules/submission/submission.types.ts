/**
 * Submission Types
 * Tipe data khusus untuk modul submission
 */

import { SubmissionStatus } from '../../shared/constants/status';

export interface Submission {
  id: string;
  userId: string;
  letterTypeId: string;
  title: string;
  description?: string;
  status: SubmissionStatus;
  attachments?: string[];
  submittedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmissionWithRelations extends Submission {
  user: {
    id: string;
    name: string;
    email: string;
  };
  letterType: {
    id: string;
    name: string;
  };
}
