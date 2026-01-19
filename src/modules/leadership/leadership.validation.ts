/**
 * Leadership Validation
 * Validasi aksi pimpinan
 */

import { z } from 'zod';

export const approveSubmissionSchema = z.object({
  notes: z.string().optional(),
});

export const rejectSubmissionSchema = z.object({
  reason: z.string().min(10, 'Alasan penolakan minimal 10 karakter'),
});

export const redisposeSubmissionSchema = z.object({
  targetUserId: z.string().uuid(),
  message: z.string().min(5, 'Pesan disposisi minimal 5 karakter'),
});

export type ApproveSubmissionInput = z.infer<typeof approveSubmissionSchema>;
export type RejectSubmissionInput = z.infer<typeof rejectSubmissionSchema>;
export type RedisposeSubmissionInput = z.infer<typeof redisposeSubmissionSchema>;
