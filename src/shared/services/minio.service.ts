/**
 * MinIO Service
 * Wrapper class untuk MinIO S3 Compatible Storage
 * Handles file upload, download, and deletion
 */

import { Client } from 'minio';
import { env } from '../../config/env';
import crypto from 'crypto';
import path from 'path';

// ============================================================================
// Configuration
// ============================================================================

const MINIO_CONFIG = {
  endPoint: env.MINIO_ENDPOINT,
  port: parseInt(env.MINIO_PORT),
  useSSL: env.MINIO_USE_SSL === 'true',
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
  region: env.MINIO_REGION || 'us-east-1',
};

const DEFAULT_BUCKET = env.MINIO_BUCKET_NAME;
const SIGNED_URL_EXPIRY = 60 * 60; // 1 hour in seconds

// ============================================================================
// Types
// ============================================================================

export interface UploadResult {
  storageName: string;
  path: string;
  bucket: string;
  etag: string;
}

export interface FileMetadata {
  fileName: string;
  mimeType: string;
  size: number;
}

// ============================================================================
// MinIO Service Class
// ============================================================================

export class MinioService {
  private client: Client;
  private bucket: string;
  private isInitialized: boolean = false;

  constructor(bucket: string = DEFAULT_BUCKET) {
    this.client = new Client(MINIO_CONFIG);
    this.bucket = bucket;
  }

  /**
   * Initialize bucket (create if not exists)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        console.log(`✅ MinIO bucket '${this.bucket}' created`);
      }
      this.isInitialized = true;
      console.log(`✅ MinIO connected to bucket '${this.bucket}'`);
    } catch (error) {
      console.error('❌ MinIO initialization failed:', error);
      throw new Error('Failed to initialize MinIO storage');
    }
  }

  /**
   * Generate unique storage name for file
   */
  private generateStorageName(originalName: string): string {
    const timestamp = Date.now();
    const randomHash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .substring(0, 50);
    
    return `${timestamp}-${randomHash}-${baseName}${ext}`;
  }

  /**
   * Build storage path with folder structure
   * Format: {folder}/{year}/{month}/{storageName}
   */
  private buildStoragePath(storageName: string, folder: string = 'attachments'): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    return `${folder}/${year}/${month}/${storageName}`;
  }

  /**
   * Upload file to MinIO
   * @param fileData - File buffer (use Buffer.from(await file.arrayBuffer()) for File objects)
   * @param originalFileName - Original file name
   * @param mimeType - File MIME type
   * @param folder - Optional folder prefix (default: 'attachments')
   * @returns UploadResult with storage path
   */
  async uploadFile(
    fileData: Buffer,
    originalFileName: string,
    mimeType: string,
    folder: string = 'attachments'
  ): Promise<UploadResult> {
    await this.initialize();

    const storageName = this.generateStorageName(originalFileName);
    const storagePath = this.buildStoragePath(storageName, folder);
    
    console.log(`[MinIO] uploadFile: bucket="${this.bucket}", storagePath="${storagePath}"`);

    try {
      const metadata = {
        'Content-Type': mimeType,
        'X-Original-Filename': encodeURIComponent(originalFileName),
      };

      const result = await this.client.putObject(
        this.bucket,
        storagePath,
        fileData,
        fileData.length,
        metadata
      );
      
      console.log(`[MinIO] uploadFile success: etag="${result.etag}", returning path="${storagePath}"`);

      return {
        storageName,
        path: storagePath,
        bucket: this.bucket,
        etag: result.etag,
      };
    } catch (error) {
      console.error('MinIO upload error:', error);
      throw new Error(`Failed to upload file: ${originalFileName}`);
    }
  }

  /**
   * Sanitize storage path - remove bucket name prefix if accidentally included
   */
  private sanitizePath(storagePath: string): string {
    let cleanPath = storagePath;
    
    // Remove bucket name prefix if accidentally included (e.g., "e-office-storage/documents/...")
    if (cleanPath.startsWith(`${this.bucket}/`)) {
      cleanPath = cleanPath.substring(this.bucket.length + 1);
      console.warn(`[MinIO] Removed bucket prefix from path: ${storagePath} -> ${cleanPath}`);
    }
    
    // Also handle double bucket prefix (e.g., "e-office-storage/e-office-storage/...")
    while (cleanPath.startsWith(`${this.bucket}/`)) {
      cleanPath = cleanPath.substring(this.bucket.length + 1);
      console.warn(`[MinIO] Removed additional bucket prefix: ${cleanPath}`);
    }
    
    // Debug log
    console.log(`[MinIO] sanitizePath: input="${storagePath}" output="${cleanPath}"`);
    
    return cleanPath;
  }

  /**
   * Get signed URL for file download/view
   * @param storagePath - Full storage path in bucket
   * @param expirySeconds - URL expiry time (default: 1 hour)
   * @returns Signed URL string
   */
  async getFileUrl(storagePath: string, expirySeconds: number = SIGNED_URL_EXPIRY): Promise<string> {
    await this.initialize();

    console.log(`[MinIO] getFileUrl called with: bucket="${this.bucket}", path="${storagePath}"`);
    
    try {
      const cleanPath = this.sanitizePath(storagePath);
      console.log(`[MinIO] Calling presignedGetObject: bucket="${this.bucket}", cleanPath="${cleanPath}"`);
      
      const url = await this.client.presignedGetObject(
        this.bucket,
        cleanPath,
        expirySeconds
      );
      console.log(`[MinIO] presignedGetObject success, URL length: ${url.length}`);
      return url;
    } catch (error) {
      console.error('[MinIO] getFileUrl error:', error);
      throw new Error(`Failed to get file URL: ${storagePath}`);
    }
  }

  /**
   * Delete file from MinIO
   * @param storagePath - Full storage path in bucket
   */
  async deleteFile(storagePath: string): Promise<void> {
    await this.initialize();

    try {
      const cleanPath = this.sanitizePath(storagePath);
      await this.client.removeObject(this.bucket, cleanPath);
    } catch (error) {
      console.error('MinIO delete error:', error);
      throw new Error(`Failed to delete file: ${storagePath}`);
    }
  }

  /**
   * Delete multiple files from MinIO
   * @param storagePaths - Array of storage paths
   */
  async deleteFiles(storagePaths: string[]): Promise<void> {
    await this.initialize();

    try {
      const cleanPaths = storagePaths.map(p => this.sanitizePath(p));
      await this.client.removeObjects(this.bucket, cleanPaths);
    } catch (error) {
      console.error('MinIO bulk delete error:', error);
      throw new Error('Failed to delete files');
    }
  }

  /**
   * Check if file exists
   * @param storagePath - Full storage path in bucket
   */
  async fileExists(storagePath: string): Promise<boolean> {
    await this.initialize();

    try {
      const cleanPath = this.sanitizePath(storagePath);
      await this.client.statObject(this.bucket, cleanPath);
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata
   * @param storagePath - Full storage path in bucket
   */
  async getFileMetadata(storagePath: string): Promise<{ size: number; contentType: string; etag: string } | null> {
    await this.initialize();

    try {
      const cleanPath = this.sanitizePath(storagePath);
      const stat = await this.client.statObject(this.bucket, cleanPath);
      return {
        size: stat.size,
        contentType: stat.metaData?.['content-type'] || 'application/octet-stream',
        etag: stat.etag,
      };
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Download file as buffer
   * @param storagePath - Full storage path in bucket
   */
  async downloadFile(storagePath: string): Promise<Buffer> {
    await this.initialize();

    try {
      const cleanPath = this.sanitizePath(storagePath);
      const stream = await this.client.getObject(this.bucket, cleanPath);
      const chunks: Buffer[] = [];
      
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      console.error('MinIO download error:', error);
      throw new Error(`Failed to download file: ${storagePath}`);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const minioService = new MinioService();
