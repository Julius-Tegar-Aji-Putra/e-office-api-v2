/**
 * Disposisi Types
 * Type data disposisi
 */

import { DisposisiStatus } from '../../shared/constants/status';

export interface Disposisi {
  id: string;
  submissionId: string;
  fromUserId: string;
  targetUserId: string;
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: DisposisiStatus;
  processedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
