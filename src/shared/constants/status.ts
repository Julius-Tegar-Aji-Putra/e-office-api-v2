/**
 * Status Constants
 * Definisi status workflow surat E-Office
 */

export const SUBMISSION_STATUS = {
  DRAFT: 'Draft',                          // Pengajuan masih draft
  SUBMITTED: 'Submitted',                  // Sudah diajukan
  PRODI_REVIEW: 'ProdiReview',            // Sedang direview Prodi
  PRODI_APPROVED: 'ProdiApproved',        // Disetujui Prodi
  PRODI_REJECTED: 'ProdiRejected',        // Ditolak Prodi
  DEPT_REVIEW: 'DeptReview',              // Sedang direview Departemen
  DEPT_APPROVED: 'DeptApproved',          // Disetujui Departemen
  DEPT_REJECTED: 'DeptRejected',          // Ditolak Departemen
  FAKULTAS_REVIEW: 'FakultasReview',      // Sedang direview Fakultas
  FAKULTAS_APPROVED: 'FakultasApproved',  // Disetujui Fakultas
  FAKULTAS_REJECTED: 'FakultasRejected',  // Ditolak Fakultas
  SIGNING: 'Signing',                      // Proses tanda tangan
  LEGALISASI: 'Legalisasi',               // Proses legalisasi UPA
  COMPLETED: 'Completed',                  // Selesai
  CANCELLED: 'Cancelled',                  // Dibatalkan
} as const;

export type SubmissionStatus = typeof SUBMISSION_STATUS[keyof typeof SUBMISSION_STATUS];

export const DISPOSISI_STATUS = {
  PENDING: 'Pending',          // Menunggu disposisi
  IN_PROGRESS: 'InProgress',   // Sedang diproses
  COMPLETED: 'Completed',      // Disposisi selesai
  REJECTED: 'Rejected',        // Ditolak
} as const;

export type DisposisiStatus = typeof DISPOSISI_STATUS[keyof typeof DISPOSISI_STATUS];

export const SIGNATURE_STATUS = {
  PENDING: 'Pending',          // Menunggu tanda tangan
  SIGNED: 'Signed',            // Sudah ditandatangani
  SKIPPED: 'Skipped',          // Dilewati
  REJECTED: 'Rejected',        // Ditolak
} as const;

export type SignatureStatus = typeof SIGNATURE_STATUS[keyof typeof SIGNATURE_STATUS];

/* ---------- Legacy aliases for dash.ts ---------- */
export const STATUS = SUBMISSION_STATUS;

export const STATUS_DISPLAY: Record<string, string> = {
  [SUBMISSION_STATUS.DRAFT]: 'Draft',
  [SUBMISSION_STATUS.SUBMITTED]: 'Diajukan',
  [SUBMISSION_STATUS.PRODI_REVIEW]: 'Review Prodi',
  [SUBMISSION_STATUS.PRODI_APPROVED]: 'Disetujui Prodi',
  [SUBMISSION_STATUS.PRODI_REJECTED]: 'Ditolak Prodi',
  [SUBMISSION_STATUS.DEPT_REVIEW]: 'Review Departemen',
  [SUBMISSION_STATUS.DEPT_APPROVED]: 'Disetujui Departemen',
  [SUBMISSION_STATUS.DEPT_REJECTED]: 'Ditolak Departemen',
  [SUBMISSION_STATUS.FAKULTAS_REVIEW]: 'Review Fakultas',
  [SUBMISSION_STATUS.FAKULTAS_APPROVED]: 'Disetujui Fakultas',
  [SUBMISSION_STATUS.FAKULTAS_REJECTED]: 'Ditolak Fakultas',
  [SUBMISSION_STATUS.SIGNING]: 'Proses TTD',
  [SUBMISSION_STATUS.LEGALISASI]: 'Legalisasi',
  [SUBMISSION_STATUS.COMPLETED]: 'Selesai',
  [SUBMISSION_STATUS.CANCELLED]: 'Dibatalkan',
};

export const getDisplayStatus = (status: string): string => {
  return STATUS_DISPLAY[status] || status;
};
