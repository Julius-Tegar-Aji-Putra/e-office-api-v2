/**
 * Legalisasi Validation
 * Validasi legalisasi
 */

import { z } from 'zod';

export const processLegalisasiSchema = z.object({
  notes: z.string().optional(),
});

export const distributeSchema = z.object({
  method: z.enum(['EMAIL', 'PICKUP', 'COURIER']),
  recipient: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
  }),
});

export type ProcessLegalisasiInput = z.infer<typeof processLegalisasiSchema>;
export type DistributeInput = z.infer<typeof distributeSchema>;
