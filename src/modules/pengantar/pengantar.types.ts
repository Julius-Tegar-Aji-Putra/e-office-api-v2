/**
 * Pengantar Types
 * Type khusus surat pengantar
 */

export interface SuratPengantar {
  id: string;
  submissionId: string;
  level: 'PRODI' | 'DEPT';
  content: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  generatedBy: string;
  approvedBy?: string;
  rejectedBy?: string;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuratPengantarWithRelations extends SuratPengantar {
  submission: any;
  generatedByUser: {
    id: string;
    name: string;
  };
  approvedByUser?: {
    id: string;
    name: string;
  };
}
