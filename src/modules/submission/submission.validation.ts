/**
 * Submission Validation Schemas
 * Validation menggunakan Typebox untuk Elysia
 */

import { t } from 'elysia';

// ============================================================================
// Custom Validator Functions
// ============================================================================

/**
 * Validasi NIP: harus tepat 18 karakter dan berupa angka
 */
function isValidNIP(value: string): boolean {
  return /^\d{18}$/.test(value);
}

/**
 * Validasi NIM: harus tepat 14 karakter dan berupa angka
 */
function isValidNIM(value: string): boolean {
  return /^\d{14}$/.test(value);
}

/**
 * Custom error messages untuk validasi
 */
const NIP_VALIDATION_ERROR = 'NIP harus berupa 18 digit angka';
const NIM_VALIDATION_ERROR = 'NIM harus berupa 14 digit angka';
const NAMA_VALIDATION_ERROR = 'Nama hanya boleh berisi huruf, spasi, dan tanda baca (, . - \') dengan panjang 1-100 karakter tanpa spasi ganda';

// ============================================================================
// Form Data Schema
// ============================================================================

export const submissionFormDataSchema = t.Object({
  // Data Diri
  // Nama: 1-100 karakter, hanya huruf dan tanda baca , . - ', tidak boleh spasi ganda
  nama: t.String({ 
    minLength: 1, 
    maxLength: 100,
    pattern: "^[a-zA-Z,.'-]+( [a-zA-Z,.'-]+)*$",
    error: NAMA_VALIDATION_ERROR 
  }),
  nim: t.Optional(
    t.String({
      pattern: '^\\d{14}$',
      error: NIM_VALIDATION_ERROR,
    })
  ),
  nip: t.Optional(
    t.String({
      pattern: '^\\d{18}$',
      error: NIP_VALIDATION_ERROR,
    })
  ),
  departemen: t.String({ minLength: 1, error: 'Departemen wajib diisi' }),
  programStudi: t.String({ minLength: 1, error: 'Program Studi wajib diisi' }),

  // Detail Surat
  jenisSurat: t.Union([t.Literal('SURAT_TUGAS'), t.Literal('SURAT_KEPUTUSAN')], {
    error: 'Jenis surat harus SURAT_TUGAS atau SURAT_KEPUTUSAN',
  }),
  // Keperluan: min 5, max 150 karakter, tidak boleh hanya angka
  keperluan: t.String({ 
    minLength: 5, 
    maxLength: 150,
    error: 'Keperluan harus 5-150 karakter dan tidak boleh hanya berisi angka' 
  }),
  // Judul Acara: optional, tapi jika diisi harus 5-150 karakter, tidak boleh hanya angka, tidak boleh ada enter
  judulAcara: t.Optional(t.String({ 
    minLength: 5, 
    maxLength: 150,
    error: 'Judul acara harus 5-150 karakter, tidak boleh hanya berisi angka, dan tidak boleh mengandung enter' 
  })),
  tanggalAcara: t.String({ error: 'Tanggal acara wajib diisi (format: ISO datetime)' }), // ISO datetime: 2026-02-15T09:00:00Z
  durasiAcara: t.Optional(t.String()),
  // Lokasi Acara: optional, tapi jika diisi harus 5-150 karakter, tidak boleh hanya angka, tidak boleh ada enter
  lokasiAcara: t.Optional(t.String({ 
    minLength: 5, 
    maxLength: 150,
    error: 'Lokasi acara harus 5-150 karakter, tidak boleh hanya berisi angka, dan tidak boleh mengandung enter' 
  })),

  // Konfigurasi TTD Surat Pengantar (sampai Kaprodi atau sampai Kadep)
  butuhTtdKadep: t.Boolean({ default: false }),
});

// ============================================================================
// Signature Config Schema
// ============================================================================

export const signatureConfigSchema = t.Object({
  targetSigner: t.Union([t.Literal('DEKAN'), t.Literal('WADEK_1'), t.Literal('WADEK_2')], {
    error: 'Target penandatangan harus DEKAN, WADEK_1, atau WADEK_2',
  }),
  requestKadepSign: t.Boolean({ default: false }),
});

// ============================================================================
// Create Submission Schema
// ============================================================================

export const createSubmissionSchema = t.Object({
  letterTypeId: t.String({ minLength: 1, error: 'ID jenis surat wajib diisi' }),
  formData: submissionFormDataSchema,
  signatureConfig: signatureConfigSchema,
});

// ============================================================================
// Update Submission Schema (untuk revisi)
// ============================================================================

export const updateSubmissionSchema = t.Partial(
  t.Object({
    formData: t.Partial(submissionFormDataSchema),
    signatureConfig: t.Partial(signatureConfigSchema),
  })
);

// ============================================================================
// Query Params Schema
// ============================================================================

export const submissionQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 10 })),
  status: t.Optional(t.String()),
  letterTypeId: t.Optional(t.String()),
  category: t.Optional(
    t.Union([t.Literal('AKADEMIK'), t.Literal('SUMBER_DAYA'), t.Literal('UMUM')])
  ),
  search: t.Optional(t.String()),
  dateFrom: t.Optional(t.String()),
  dateTo: t.Optional(t.String()),
  sortBy: t.Optional(
    t.Union([t.Literal('submittedAt'), t.Literal('status'), t.Literal('judulSurat')])
  ),
  sortOrder: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])),
});

// ============================================================================
// Path Params Schema
// ============================================================================

export const submissionIdParamSchema = t.Object({
  id: t.String({ minLength: 1, error: 'ID submission wajib diisi' }),
});

// ============================================================================
// Cancel/Resubmit Schema
// ============================================================================

export const cancelSubmissionSchema = t.Object({
  alasan: t.Optional(t.String()),
});

export const resubmitSchema = t.Object({
  formData: submissionFormDataSchema,
  signatureConfig: signatureConfigSchema,
});

// ============================================================================
// File Upload Constants
// ============================================================================

export const FILE_UPLOAD_CONFIG = {
  MAX_FILES: 5,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB in bytes
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ] as const,
  ALLOWED_EXTENSIONS: ['.pdf', '.jpg', '.jpeg', '.png'] as const,
};

// ============================================================================
// Create Submission with Attachments Schema (Multipart Form Data)
// ============================================================================

export const createSubmissionWithFilesSchema = t.Object({
  letterTypeId: t.String({ minLength: 1, error: 'ID jenis surat wajib diisi' }),
  
  // Data Diri
  nama: t.String({ minLength: 2, error: 'Nama minimal 2 karakter' }),
  nim: t.Optional(t.String()),
  nip: t.Optional(
    t.String({
      pattern: '^\\d{18}$',
      error: NIP_VALIDATION_ERROR,
    })
  ),
  departemen: t.String({ minLength: 1, error: 'Departemen wajib diisi' }),
  programStudi: t.String({ minLength: 1, error: 'Program Studi wajib diisi' }),
  
  // Kebutuhan Surat
  jenisSurat: t.Union([t.Literal('SURAT_TUGAS'), t.Literal('SURAT_KEPUTUSAN')], {
    error: 'Jenis surat harus SURAT_TUGAS atau SURAT_KEPUTUSAN',
  }),
  keperluan: t.String({ minLength: 1, error: 'Keperluan wajib diisi' }),
  // Judul Acara: optional, tapi jika diisi harus 5-150 karakter, tidak boleh hanya angka, tidak boleh ada enter
  judulAcara: t.Optional(t.String({ 
    minLength: 5, 
    maxLength: 150,
    error: 'Judul acara harus 5-150 karakter, tidak boleh hanya berisi angka, dan tidak boleh mengandung enter' 
  })),
  tanggalAcara: t.String({ error: 'Tanggal acara wajib diisi (format: ISO datetime)' }),
  durasiAcara: t.Optional(t.String()),
  // Lokasi Acara: optional, tapi jika diisi harus 5-150 karakter, tidak boleh hanya angka, tidak boleh ada enter
  lokasiAcara: t.Optional(t.String({ 
    minLength: 5, 
    maxLength: 150,
    error: 'Lokasi acara harus 5-150 karakter, tidak boleh hanya berisi angka, dan tidak boleh mengandung enter' 
  })),
  
  // TTD Config
  butuhTtdKadep: t.Optional(t.Union([t.Boolean(), t.String()])),
  targetSigner: t.Union([t.Literal('DEKAN'), t.Literal('WADEK_1'), t.Literal('WADEK_2')], {
    error: 'Target penandatangan harus DEKAN, WADEK_1, atau WADEK_2',
  }),
  requestKadepSign: t.Optional(t.Union([t.Boolean(), t.String()])),
  
  // Lampiran (max 5 files)
  attachments: t.Optional(t.Files({
    maxItems: FILE_UPLOAD_CONFIG.MAX_FILES,
    error: `Maksimal ${FILE_UPLOAD_CONFIG.MAX_FILES} file`,
  })),
});

// ============================================================================
// Upload Attachment Schema
// ============================================================================

export const uploadAttachmentSchema = t.Object({
  file: t.File({
    error: 'File wajib diupload',
  }),
  description: t.Optional(t.String({ maxLength: 500 })),
});

// ============================================================================
// File Validation Helper
// ============================================================================

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > FILE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File ${file.name} terlalu besar. Maksimal ${FILE_UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }
  
  const mimeType = file.type.toLowerCase();
  if (!FILE_UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    return {
      valid: false,
      error: `File ${file.name} memiliki tipe yang tidak diizinkan. Hanya PDF, JPG, dan PNG yang diperbolehkan`,
    };
  }
  
  return { valid: true };
}

export function validateFiles(files: File[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (files.length > FILE_UPLOAD_CONFIG.MAX_FILES) {
    errors.push(`Maksimal ${FILE_UPLOAD_CONFIG.MAX_FILES} file yang dapat diupload`);
  }
  
  for (const file of files) {
    const result = validateFile(file);
    if (!result.valid && result.error) {
      errors.push(result.error);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
