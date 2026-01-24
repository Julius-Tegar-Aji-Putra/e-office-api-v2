/**
 * String Utilities
 */

/**
 * Generate random string
 */
export function generateRandomString(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate reference code for letter
 * Format: [TYPE]/[CATEGORY]/[YEAR]/[SEQUENCE]
 */
export function generateReferenceCode(
  type: string,
  category: string,
  year: number,
  sequence: number
): string {
  const seqPadded = sequence.toString().padStart(4, '0');
  return `${type}/${category}/${year}/${seqPadded}`;
}

/**
 * Generate ticket number
 * Format: TKT-[YEAR][MONTH]-[RANDOM]
 */
export function generateTicketNumber(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const random = generateRandomString(6).toUpperCase();
  return `TKT-${year}${month}-${random}`;
}

/**
 * Slugify string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Capitalize first letter
 */
export function capitalize(text: string): string {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Capitalize each word
 */
export function capitalizeWords(text: string): string {
  if (!text) return '';
  return text.split(' ').map(capitalize).join(' ');
}

/**
 * Truncate string with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Extract initials from name
 */
export function getInitials(name: string, maxLength: number = 2): string {
  if (!name) return '';
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase())
    .slice(0, maxLength)
    .join('');
}

/**
 * Normalize NIM/NIP format
 */
export function normalizeIdentifier(identifier: string): string {
  return identifier.replace(/[^0-9]/g, '');
}

/**
 * Format NIM for display (add dots for readability)
 */
export function formatNIM(nim: string): string {
  const normalized = normalizeIdentifier(nim);
  if (normalized.length !== 14) return nim;
  // Format: XX.XXXXX.XXX.XXXX
  return `${normalized.slice(0, 2)}.${normalized.slice(2, 7)}.${normalized.slice(7, 10)}.${normalized.slice(10)}`;
}

/**
 * Clean whitespace (remove extra spaces, trim)
 */
export function cleanWhitespace(text: string): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Check if string is empty or whitespace only
 */
export function isBlank(text: string | null | undefined): boolean {
  return !text || text.trim().length === 0;
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Mask sensitive data
 */
export function maskString(text: string, visibleChars: number = 4): string {
  if (!text || text.length <= visibleChars) return text;
  const visible = text.slice(-visibleChars);
  const masked = '*'.repeat(text.length - visibleChars);
  return masked + visible;
}

/**
 * Mask email address
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}
