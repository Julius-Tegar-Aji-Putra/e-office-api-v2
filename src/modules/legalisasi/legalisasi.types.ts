/**
 * Legalisasi Types
 * Type data legalisasi
 */

export interface Legalisasi {
  id: string;
  suratHasilId: string;
  processedBy: string;
  nomorSurat: string;
  stampedAt: Date;
  distributedBy?: string;
  distributedAt?: Date;
  distributionMethod?: 'EMAIL' | 'PICKUP' | 'COURIER';
  recipientInfo?: any;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
