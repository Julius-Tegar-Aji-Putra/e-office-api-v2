/**
 * Hasil Types
 * Type surat hasil & signer
 */

import { SignatureStatus } from '../../shared/constants/status';

export interface SuratHasil {
  id: string;
  submissionId: string;
  generatedBy: string;
  content: string;
  documentUrl: string;
  status: 'PENDING' | 'SIGNING' | 'SIGNED_COMPLETE';
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Signature {
  id: string;
  suratHasilId: string;
  userId: string;
  order: number;
  status: SignatureStatus;
  signedAt?: Date;
  signatureUrl?: string;
  createdAt: Date;
}
