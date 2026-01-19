/**
 * Hasil Validation
 * Validasi target signer & aksi
 */

import { z } from 'zod';

export const generateHasilSchema = z.object({
  content: z.string().min(10, 'Konten surat minimal 10 karakter'),
  documentUrl: z.string().url('URL dokumen harus valid'),
  signers: z.array(
    z.object({
      userId: z.string().uuid(),
      order: z.number().min(1),
    })
  ).min(1, 'Minimal 1 penandatangan'),
});

export const signDocumentSchema = z.object({
  signatureUrl: z.string().url('URL tanda tangan harus valid'),
});

export type GenerateHasilInput = z.infer<typeof generateHasilSchema>;
export type SignDocumentInput = z.infer<typeof signDocumentSchema>;
