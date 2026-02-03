/**
 * Encryption Utilities
 * AES encryption/decryption for QR Code verification data
 * Menggunakan crypto-js untuk enkripsi yang aman
 */

import CryptoJS from 'crypto-js';
import { env } from '../../config/env';

// ============================================================================
// TYPES
// ============================================================================

export interface VerificationPayload {
  id: string;           // Document/Letter ID
  no: string;           // Nomor Surat
  ttd: string;          // Nama penandatangan utama
  tgl: string;          // Tanggal surat (ISO string)
  jenis: string;        // Jenis surat (ST/SK)
  perihal?: string;     // Perihal singkat
  timestamp: number;    // Timestamp enkripsi
}

export interface DecryptResult {
  success: boolean;
  data?: VerificationPayload;
  error?: string;
}

// ============================================================================
// ENCRYPTION FUNCTIONS
// ============================================================================

/**
 * Encrypt verification data untuk QR Code
 * @param data - Object data yang akan di-encrypt
 * @returns URL-safe Base64 encoded encrypted string
 */
export function encryptVerificationData(data: Omit<VerificationPayload, 'timestamp'>): string {
  try {
    const payload: VerificationPayload = {
      ...data,
      timestamp: Date.now()
    };

    // Convert to JSON string
    const jsonString = JSON.stringify(payload);

    // Encrypt using AES
    const encrypted = CryptoJS.AES.encrypt(jsonString, env.APP_KEY).toString();

    // Convert to URL-safe Base64
    const urlSafe = encrypted
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return urlSafe;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt verification data');
  }
}

/**
 * Decrypt verification data dari QR Code token
 * @param token - URL-safe Base64 encoded encrypted string
 * @returns Decrypted verification payload atau error
 */
export function decryptVerificationData(token: string): DecryptResult {
  try {
    // Convert from URL-safe Base64 back to standard Base64
    let base64 = token
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    // Add padding if needed
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    // Decrypt using AES
    const decrypted = CryptoJS.AES.decrypt(base64, env.APP_KEY);
    const jsonString = decrypted.toString(CryptoJS.enc.Utf8);

    if (!jsonString) {
      return {
        success: false,
        error: 'Invalid token - decryption failed'
      };
    }

    // Parse JSON
    const payload: VerificationPayload = JSON.parse(jsonString);

    // Validate required fields
    if (!payload.id || !payload.no || !payload.ttd) {
      return {
        success: false,
        error: 'Invalid token - missing required fields'
      };
    }

    return {
      success: true,
      data: payload
    };
  } catch (error) {
    console.error('Decryption error:', error);
    return {
      success: false,
      error: 'QR Code tidak valid atau telah dipalsukan'
    };
  }
}

/**
 * Generate verification URL for QR Code
 * Uses SHORT TOKEN for better scannability
 * ALWAYS use HOST_IP in development mode for network testing
 * @param shortToken - Short token (8-10 characters) from database
 * @returns Full verification URL that can be easily scanned from mobile devices
 */
export function generateVerificationUrl(shortToken: string): string {
  // DEVELOPMENT MODE: Selalu pakai HOST_IP untuk network access testing
  if (env.NODE_ENV === 'development') {
    const hostIp = env.HOST_IP || 'localhost';
    const frontendPort = env.FRONTEND_PORT || '3000';
    const dynamicBaseUrl = `http://${hostIp}:${frontendPort}`;
    return `${dynamicBaseUrl}/verify?token=${shortToken}`;
  }
  
  // PRODUCTION MODE: Gunakan VERIFICATION_BASE_URL
  const baseUrl = env.VERIFICATION_BASE_URL;
  return `${baseUrl}/verify?token=${shortToken}`;
}

/**
 * Validate token expiry (optional, for time-based validity)
 * @param payload - Decrypted verification payload
 * @param maxAgeMs - Maximum age in milliseconds (default: 10 years)
 * @returns Whether the token is still valid
 */
export function isTokenValid(
  payload: VerificationPayload,
  maxAgeMs: number = 10 * 365 * 24 * 60 * 60 * 1000 // 10 years default
): boolean {
  const age = Date.now() - payload.timestamp;
  return age <= maxAgeMs;
}
