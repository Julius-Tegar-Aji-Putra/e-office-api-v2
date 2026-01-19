/**
 * Disposisi Validation
 * Validasi target & jenis disposisi
 */

import { z } from 'zod';

export const createDisposisiSchema = z.object({
  submissionId: z.string().uuid(),
  targetUserId: z.string().uuid(),
  message: z.string().min(5, 'Pesan disposisi minimal 5 karakter'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

export const processDisposisiSchema = z.object({
  action: z.enum(['accept', 'reject']),
  notes: z.string().optional(),
});

export type CreateDisposisiInput = z.infer<typeof createDisposisiSchema>;
export type ProcessDisposisiInput = z.infer<typeof processDisposisiSchema>;
