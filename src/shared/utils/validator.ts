/**
 * Validation Utilities
 */

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate NIM format (14 digits)
 */
export function isValidNIM(nim: string): boolean {
  const normalized = nim.replace(/[^0-9]/g, '');
  return normalized.length === 14;
}

/**
 * Validate NIP format (18 digits)
 */
export function isValidNIP(nip: string): boolean {
  const normalized = nip.replace(/[^0-9]/g, '');
  return normalized.length === 18;
}

/**
 * Validate phone number (Indonesian format)
 */
export function isValidPhone(phone: string): boolean {
  const normalized = phone.replace(/[^0-9+]/g, '');
  // Indonesian phone: starts with +62 or 0, 10-13 digits total
  const phoneRegex = /^(\+62|62|0)[8][0-9]{8,11}$/;
  return phoneRegex.test(normalized);
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate file extension
 */
export function isValidFileExtension(filename: string, allowedExtensions: string[]): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return false;
  return allowedExtensions.map((e) => e.toLowerCase().replace('.', '')).includes(ext);
}

/**
 * Validate file size (in bytes)
 */
export function isValidFileSize(size: number, maxSizeBytes: number): boolean {
  return size > 0 && size <= maxSizeBytes;
}

/**
 * Allowed document file extensions
 */
export const ALLOWED_DOCUMENT_EXTENSIONS = ['pdf', 'doc', 'docx'];

/**
 * Allowed image file extensions
 */
export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

/**
 * Maximum file size (10MB in bytes)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Validate document file
 */
export function isValidDocument(filename: string, size: number): boolean {
  return (
    isValidFileExtension(filename, ALLOWED_DOCUMENT_EXTENSIONS) && isValidFileSize(size, MAX_FILE_SIZE)
  );
}

/**
 * Validate image file
 */
export function isValidImage(filename: string, size: number): boolean {
  return (
    isValidFileExtension(filename, ALLOWED_IMAGE_EXTENSIONS) && isValidFileSize(size, MAX_FILE_SIZE)
  );
}

/**
 * Validate date string (ISO format)
 */
export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Validate date is not in the past
 */
export function isFutureDate(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  date.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return date >= now;
}

/**
 * Validate date range
 */
export function isValidDateRange(startDate: string, endDate: string): boolean {
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return false;
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  return start <= end;
}

/**
 * Validate required fields
 */
export function validateRequired<T extends Record<string, unknown>>(
  data: T,
  requiredFields: (keyof T)[]
): { isValid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    const value = data[field];
    if (value === undefined || value === null || value === '') {
      missingFields.push(field as string);
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Validate letter category enum
 */
export function isValidLetterCategory(category: string): boolean {
  const validCategories = ['AKADEMIK', 'PENELITIAN', 'PENGABDIAN', 'KEPEGAWAIAN', 'KERJASAMA', 'LAINNYA'];
  return validCategories.includes(category);
}

/**
 * Validate document type enum
 */
export function isValidDocumentType(docType: string): boolean {
  const validTypes = ['PENGANTAR', 'SURAT_TUGAS', 'SK'];
  return validTypes.includes(docType);
}

/**
 * Validate letter status enum
 */
export function isValidLetterStatus(status: string): boolean {
  const validStatuses = [
    'DRAFT',
    'SUBMITTED',
    'REVIEW_KAPRODI',
    'RETURNED_BY_KAPRODI',
    'DRAFT_PENGANTAR',
    'TTD_CHAIN_PENGANTAR',
    'RECEIVED_FAKULTAS',
    'DISPOSISI_PROCESS',
    'RETURNED_BY_DISPOSISI',
    'DRAFT_SURAT_HASIL',
    'VERIFICATION_CHAIN',
    'RETURNED_BY_VERIFIER',
    'NUMBERING_PENDING',
    'COMPLETED',
    'REJECTED',
    'CANCELLED',
  ];
  return validStatuses.includes(status);
}
