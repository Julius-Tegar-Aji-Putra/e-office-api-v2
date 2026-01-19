/**
 * Submission Validation
 * Request validation menggunakan Zod schema
 */

import { z } from 'zod';

export const createSubmissionSchema = z.object({
  letterTypeId: z.string().uuid('ID jenis surat harus valid UUID'),
  title: z.string().min(5, 'Judul minimal 5 karakter'),
  description: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export const updateSubmissionSchema = z.object({
  title: z.string().min(5, 'Judul minimal 5 karakter').optional(),
  description: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
export type UpdateSubmissionInput = z.infer<typeof updateSubmissionSchema>;
