/**
 * Short Token Generator
 * Generate short, unique, URL-safe token untuk QR Code verification
 * Menggunakan kombinasi timestamp + random untuk uniqueness
 */

import { customAlphabet } from 'nanoid';

/**
 * Generate short verification token (8-10 karakter)
 * Format: [timestamp-base36][random-alphanumeric]
 * 
 * Contoh output: "2k4x9pqr" atau "3m8y2fgh"
 * 
 * @returns Short URL-safe token (8-10 characters)
 */
export function generateShortToken(): string {
  // Custom alphabet tanpa karakter yang membingungkan (0, O, I, l)
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const nanoid = customAlphabet(alphabet, 6);
  
  // Timestamp dalam base36 (lebih compact)
  const timestampPart = Date.now().toString(36).slice(-4); // 4 karakter terakhir
  
  // Random part (6 karakter)
  const randomPart = nanoid();
  
  // Gabungkan: 4 + 6 = 10 karakter total
  return `${timestampPart}${randomPart}`;
}

/**
 * Validate short token format
 * @param token - Token to validate
 * @returns True if valid format
 */
export function isValidShortToken(token: string): boolean {
  // Must be 8-12 characters alphanumeric
  return /^[a-zA-Z0-9]{8,12}$/.test(token);
}
