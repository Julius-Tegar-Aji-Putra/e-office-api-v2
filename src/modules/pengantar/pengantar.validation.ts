/**
 * Pengantar Validation
 * Validasi input & format surat pengantar
 */

import { z } from 'zod';

export const generatePengantarSchema = z.object({
  content: z.string().min(10, 'Konten surat minimal 10 karakter'),
  attachments: z.array(z.string()).optional(),
});

export const rejectPengantarSchema = z.object({
  reason: z.string().min(10, 'Alasan penolakan minimal 10 karakter'),
});

export type GeneratePengantarInput = z.infer<typeof generatePengantarSchema>;
export type RejectPengantarInput = z.infer<typeof rejectPengantarSchema>;
