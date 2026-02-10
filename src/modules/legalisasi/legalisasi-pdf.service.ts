/**
 * Legalisasi PDF Service (Refactored)
 * 
 * Hanya bertanggung jawab untuk:
 * 1. Generate QR Code dengan logo UNDIP (menggunakan short token untuk verifikasi)
 * 2. Upload PDF ke MinIO storage
 * 
 * PDF generation sekarang dilakukan di FRONTEND menggunakan html2canvas + jsPDF + pdf-lib.
 * Backend tidak lagi menggunakan Puppeteer atau HTML templates.
 * 
 * Flow legalisasi:
 * 1. UPA memberikan nomor surat -> hanya update DB (frontend preview auto-update)
 * 2. UPA membubuhkan stempel -> hanya update DB (frontend preview auto-update)
 * 3. UPA generate QR Code -> backend generate token + QR image, simpan ke DB
 * 4. Finalisasi -> frontend generate final PDF, upload ke backend, backend simpan di MinIO
 */

import QRCode from 'qrcode';
import { prisma } from '../../db';
import { MinioService } from '../../shared/services/minio.service';
import { generateVerificationUrl } from '../../shared/utils/encryption';
import { generateShortToken } from '../../shared/utils/short-token';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// SERVICE CLASS
// ============================================================================

class LegalisasiPdfService {
  private minioService: MinioService;

  constructor() {
    this.minioService = new MinioService();
  }

  /**
   * Load UNDIP logo untuk QR Code
   */
  private async getLogoForQRCode(): Promise<string | null> {
    try {
      const logoPath = path.join(process.cwd(), 'public', 'logo-undip.png');
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        return `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
      const stempelPath = path.join(process.cwd(), 'public', 'stempel.png');
      if (fs.existsSync(stempelPath)) {
        const stempelBuffer = fs.readFileSync(stempelPath);
        return `data:image/png;base64,${stempelBuffer.toString('base64')}`;
      }
      return null;
    } catch (error) {
      console.error('[LegalisasiPdf] Error loading logo for QR Code:', error);
      return null;
    }
  }

  /**
   * Generate QR Code dengan logo UNDIP di tengah
   * Menggunakan sharp untuk overlay logo pada QR Code
   */
  async generateQRCodeWithLogo(
    data: string,
    options: {
      width?: number;
      logoSize?: number;
    } = {}
  ): Promise<string> {
    const width = options.width || 250;
    const logoSizePercent = options.logoSize || 0.26;
    
    const qrCodeDataUrl = await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: width,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    const logoDataUrl = await this.getLogoForQRCode();
    
    if (!logoDataUrl) {
      console.log('[LegalisasiPdf] No logo found, using plain QR Code');
      return qrCodeDataUrl;
    }

    try {
      const sharp = (await import('sharp')).default;
      
      const qrBase64 = qrCodeDataUrl.split(',')[1];
      const qrBuffer = Buffer.from(qrBase64, 'base64');
      
      const logoBase64 = logoDataUrl.split(',')[1];
      const logoBuffer = Buffer.from(logoBase64, 'base64');
      
      const logoSize = Math.floor(width * logoSizePercent);
      const logoPosition = Math.floor((width - logoSize) / 2);
      
      const framePadding = 8;
      const frameSize = logoSize + (framePadding * 2);
      const framePosition = Math.floor((width - frameSize) / 2);
      
      const logoWithPadding = await sharp(logoBuffer)
        .resize(logoSize - framePadding, logoSize - framePadding, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .extend({
          top: framePadding / 2,
          bottom: framePadding / 2,
          left: framePadding / 2,
          right: framePadding / 2,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .png()
        .toBuffer();
      
      const whiteFrame = await sharp({
        create: {
          width: frameSize,
          height: frameSize,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .png()
      .toBuffer();
      
      const qrWithLogo = await sharp(qrBuffer)
        .composite([
          {
            input: whiteFrame,
            top: framePosition,
            left: framePosition,
          },
          {
            input: logoWithPadding,
            top: logoPosition,
            left: logoPosition,
          }
        ])
        .png()
        .toBuffer();
      
      return `data:image/png;base64,${qrWithLogo.toString('base64')}`;
    } catch (error) {
      console.error('[LegalisasiPdf] Error compositing logo on QR Code:', error);
      return qrCodeDataUrl;
    }
  }

  /**
   * Generate QR Code untuk verifikasi dokumen
   * Menggunakan SHORT TOKEN untuk QR Code yang mudah di-scan
   * 
   * Returns QR code data URL + token + verification URL
   * (Tidak lagi me-regenerate PDF - frontend yang handle)
   */
  async generateVerificationQRCode(documentId: string): Promise<{
    qrCodeDataUrl: string;
    qrCodeBase64: string;
    shortToken: string;
    verificationUrl: string;
  }> {
    let shortToken = generateShortToken();
    
    let existingDoc = await prisma.letterDocument.findUnique({
      where: { verificationToken: shortToken },
    });
    
    while (existingDoc) {
      shortToken = generateShortToken();
      existingDoc = await prisma.letterDocument.findUnique({
        where: { verificationToken: shortToken },
      });
    }

    const verificationUrl = generateVerificationUrl(shortToken);
    console.log(`[LegalisasiPdf] Short Token: ${shortToken}`);
    console.log(`[LegalisasiPdf] Verification URL: ${verificationUrl} (${verificationUrl.length} chars)`);

    const qrCodeDataUrl = await this.generateQRCodeWithLogo(verificationUrl, {
      width: 250,
      logoSize: 0.26,
    });

    const qrCodeBase64 = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');

    return {
      qrCodeDataUrl,
      qrCodeBase64,
      shortToken,
      verificationUrl,
    };
  }

  /**
   * Upload PDF ke MinIO storage
   * Returns storage path (NOT signed URL) for database storage
   */
  async uploadPdf(pdfBuffer: Buffer, fileName: string): Promise<string> {
    console.log(`[LegalisasiPdf] uploadPdf called with fileName: ${fileName}`);
    
    const uploadResult = await this.minioService.uploadFile(
      pdfBuffer,
      fileName,
      'application/pdf',
      'documents'
    );
    console.log(`[LegalisasiPdf] Upload complete, storage path: ${uploadResult.path}`);

    return uploadResult.path;
  }
}

export const legalisasiPdfService = new LegalisasiPdfService();
