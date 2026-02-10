/**
 * Legalisasi PDF Service
 * Service untuk regenerate PDF dengan nomor surat, stempel, QR code, dan tanda tangan
 * 
 * MENGGUNAKAN PUPPETEER untuk generate PDF dari HTML template
 * Ini lebih reliable daripada overlay technique karena PDF di-generate ulang
 * dengan data yang sudah lengkap
 * 
 * Proses legalisasi:
 * 1. UPA memberikan nomor surat → PDF di-regenerate dari template dengan nomor
 * 2. UPA membubuhkan stempel → PDF di-regenerate dengan stempel UNDIP
 * 3. UPA generate QR Code → PDF di-regenerate dengan QR Code di setiap halaman
 * 4. Finalisasi → PDF final siap distribusi
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import puppeteer from 'puppeteer';
import { prisma } from '../../db';
import { MinioService } from '../../shared/services/minio.service';
import { env } from '../../config/env';
import { generateVerificationUrl } from '../../shared/utils/encryption';
import { generateShortToken } from '../../shared/utils/short-token';
import { suratTugasTemplate, type SuratTugasData, type SignatureBlock, type TembusanRecipient as TembusanRecipientST } from '../../shared/templates/surat-tugas.template';
import { suratKeputusanTemplate, type SuratKeputusanData, type KeputusanItem, type TembusanRecipient } from '../../shared/templates/surat-keputusan.template';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// CONSTANTS
// ============================================================================

// Helper function to load stempel as data URL
const getStempelDataUrl = (): string => {
  try {
    const stempelPath = path.join(process.cwd(), 'public', 'stempel.png');
    const stempelBuffer = fs.readFileSync(stempelPath);
    const base64 = stempelBuffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.error('[LegalisasiPdf] Failed to load stempel.png, using fallback:', error);
    // Fallback to Wikipedia logo if local file not found
    return 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Logo_Undip.png';
  }
};

// Stempel UNDIP - loaded from local file as data URL for reliable embedding
const UNDIP_STEMPEL_URL = getStempelDataUrl();

// Default posisi stempel dan QR
const STEMPEL_CONFIG = {
  width: 80,
  height: 80,
  offsetFromRight: 200, // Jarak dari kanan
  offsetFromBottom: 80, // Jarak dari bawah (di atas tanda tangan)
  opacity: 0.85,
};

const QR_CODE_CONFIG = {
  width: 85, // Lebih besar untuk scannability dari HP
  height: 85,
  offsetFromRight: 35, // Pojok kanan bawah
  offsetFromBottom: 35,
  addToAllPages: true,
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

class LegalisasiPdfService {
  private minioService: MinioService;

  constructor() {
    this.minioService = new MinioService();
  }

  /**
   * Generate PDF dari HTML menggunakan Puppeteer
   * Ini adalah method utama untuk regenerate PDF dengan data lengkap
   */
  async generatePdfFromHtml(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });

    try {
      const page = await browser.newPage();
      
      // Set content dengan timeout yang cukup untuk load images
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      // Wait additional time for images to fully render
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /**
   * Build data untuk template Surat Tugas dari dokumen database
   */
  async buildSuratTugasData(
    documentId: string,
    options: {
      nomorSurat?: string;
      stempelUrl?: string;
      qrCodeDataUrl?: string;
    } = {}
  ): Promise<SuratTugasData> {
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId },
      include: {
        letterInstance: {
          include: {
            createdBy: {
              include: {
                mahasiswa: {
                  include: {
                    programStudi: true,
                  },
                },
                pegawai: {
                  include: {
                    programStudi: true,
                  },
                },
              },
            },
            letterType: true,
          },
        },
        signatures: {
          where: { status: 'SIGNED' },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!document) {
      throw new Error('Dokumen tidak ditemukan');
    }

    const letterInstance = document.letterInstance;
    const submissionValues = (letterInstance.submissionValues as Record<string, unknown>) || {};
    const user = letterInstance.createdBy;
    const mahasiswa = user.mahasiswa;
    const pegawai = user.pegawai;

    // Build signatures array
    const signatures: SignatureBlock[] = document.signatures.map((sig) => ({
      signerRole: sig.signerRole,
      signerName: sig.signerName || '',
      signerNip: sig.signerNip || undefined,
      signatureUrl: sig.signatureUrl || undefined,
      prefix: sig.prefix || undefined,
      signedAt: sig.signedAt
        ? new Date(sig.signedAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : undefined,
    }));

    // Determine jenis surat
    const jenisSurat = document.type === 'SURAT_KEPUTUSAN' ? 'keputusan' : 'tugas';
    const jenisSuratText = document.type === 'SURAT_KEPUTUSAN' ? 'SURAT KEPUTUSAN' : 'SURAT TUGAS';

    // Format tanggal surat
    const tanggalSurat = document.tanggalSurat
      ? `Semarang, ${new Date(document.tanggalSurat).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`
      : undefined;

    // Extract tembusan from document data, preserving userId for template filtering
    const tembusanData = document.tembusan as Array<string | { userId?: string; name: string; description?: string }> | null;
    let tembusan: TembusanRecipientST[] | undefined;
    if (tembusanData && Array.isArray(tembusanData)) {
      tembusan = tembusanData.map(t => {
        if (typeof t === 'string') {
          return { userId: '', name: t };
        }
        return { userId: t.userId || '', name: t.name, description: t.description };
      });
    }

    return {
      jenisSurat,
      jenisSuratText,
      nomorSurat: options.nomorSurat || document.nomorSurat || '-',
      namaLengkap: user.name,
      nimNip: mahasiswa?.nim || pegawai?.nip || '-',
      programStudi: mahasiswa?.programStudi?.name || pegawai?.programStudi?.name || '-',
      keperluan: (submissionValues.keperluan as string) || '-',
      judulSurat: document.perihal || (submissionValues.perihal as string) || '-',
      signatures,
      tanggalSurat,
      stempelUrl: options.stempelUrl || (document.sealImageUrl ? document.sealImageUrl : undefined),
      qrCodeDataUrl: options.qrCodeDataUrl || (document.qrCodeUrl ? document.qrCodeUrl : undefined),
      tembusan,
    };
  }

  /**
   * Build data untuk template Surat Keputusan dari dokumen database
   */
  async buildSuratKeputusanData(
    documentId: string,
    options: {
      nomorSurat?: string;
      stempelUrl?: string;
      qrCodeDataUrl?: string;
    } = {}
  ): Promise<SuratKeputusanData> {
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId },
      include: {
        letterInstance: {
          include: {
            createdBy: {
              include: {
                mahasiswa: {
                  include: {
                    programStudi: true,
                  },
                },
                pegawai: {
                  include: {
                    programStudi: true,
                  },
                },
              },
            },
            letterType: true,
          },
        },
        signatures: {
          where: { status: 'SIGNED' },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!document) {
      throw new Error('Dokumen tidak ditemukan');
    }

    const letterInstance = document.letterInstance;
    const contentData = (document.content as Record<string, unknown>) || {};

    // Build signatures array
    const signatures: SignatureBlock[] = document.signatures.map((sig) => ({
      signerRole: sig.signerRole,
      signerName: sig.signerName || '',
      signerNip: sig.signerNip || undefined,
      signatureUrl: sig.signatureUrl || undefined,
      prefix: sig.prefix || undefined,
      signedAt: sig.signedAt
        ? new Date(sig.signedAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : undefined,
    }));

    // Extract keputusan items from content
    const keputusanData = (contentData.keputusan as KeputusanItem[]) || [];
    const keputusan: KeputusanItem[] = keputusanData.length > 0 
      ? keputusanData 
      : [{ label: 'KESATU', content: '-' }];

    // Extract menimbang and mengingat from content
    const menimbang = (contentData.menimbang as string[]) || ['-'];
    const mengingat = (contentData.mengingat as string[]) || ['-'];

    // Extract tembusan from document data (not content JSON), preserving userId for template filtering
    const tembusanRaw = document.tembusan as Array<string | { userId?: string; name: string; description?: string }> | null;
    let tembusan: TembusanRecipient[] | undefined;
    if (tembusanRaw && Array.isArray(tembusanRaw)) {
      tembusan = tembusanRaw.map(t => {
        if (typeof t === 'string') {
          return { userId: '', name: t };
        }
        return { userId: t.userId || '', name: t.name, description: t.description };
      });
    }

    // Format tanggal ditetapkan
    const tanggalDitetapkan = document.tanggalSurat
      ? new Date(document.tanggalSurat).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : new Date().toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

    // Check if there's lampiran/data peserta
    const dataPeserta = (contentData.dataPeserta as Array<{ nama: string; nim: string }>) || undefined;
    const lampiran = dataPeserta && dataPeserta.length > 0;

    return {
      nomorSurat: options.nomorSurat || document.nomorSurat || '-',
      tentang: document.perihal || (contentData.tentang as string) || '-',
      menimbang,
      mengingat,
      menetapkan: (contentData.menetapkan as string) || '-',
      keputusan,
      tanggalDitetapkan,
      lampiran,
      dataPeserta,
      signatures,
      qrCodeDataUrl: options.qrCodeDataUrl || (document.qrCodeUrl ? document.qrCodeUrl : undefined),
      tembusan,
    };
  }

  /**
   * Update nomor surat di PDF yang sudah ada (DEPRECATED - gunakan overlayNomorSuratAtPosition)
   * Menggunakan teknik overlay - menutup text lama dengan kotak putih lalu menggambar text baru
   */
  async updateNomorSuratInPdf(
    pdfBytes: Uint8Array,
    nomorSurat: string
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Embed font
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

    // Posisi nomor surat - biasanya di bawah judul "SURAT TUGAS"
    // Pada template FSM UNDIP, "Nomor : " berada sekitar 200pt dari atas, di tengah
    const nomorY = height - 200;
    const nomorText = `Nomor : ${nomorSurat}`;
    const textWidth = font.widthOfTextAtSize(nomorText, 11);
    const centerX = (width - textWidth) / 2;

    // Cover area nomor surat lama dengan kotak putih
    const coverWidth = 300;
    const coverX = (width - coverWidth) / 2;
    
    firstPage.drawRectangle({
      x: coverX,
      y: nomorY - 5,
      width: coverWidth,
      height: 20,
      color: rgb(1, 1, 1), // White
    });

    // Gambar nomor surat baru
    firstPage.drawText(nomorText, {
      x: centerX,
      y: nomorY,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });

    return pdfDoc.save();
  }

  /**
   * Overlay nomor surat ke PDF pada posisi yang ditentukan
   * Menggunakan background putih dan teks hitam Times New Roman
   * 
   * @param pdfBytes - PDF bytes
   * @param nomorSurat - Nomor surat yang akan di-overlay
   * @param position - Posisi overlay {x, y, page, fontSize}
   * @returns PDF bytes yang sudah dimodifikasi
   */
  async overlayNomorSuratAtPosition(
    pdfBytes: Uint8Array,
    nomorSurat: string,
    position: {
      x: number;
      y: number;
      page: number;
      fontSize: number;
    }
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    
    // Validasi halaman
    const pageIndex = Math.max(0, Math.min(position.page - 1, pages.length - 1));
    const targetPage = pages[pageIndex];
    const { height } = targetPage.getSize();

    // Embed font Times New Roman
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

    // Text yang akan ditampilkan
    const nomorText = `Nomor : ${nomorSurat}`;
    const fontSize = Math.max(8, Math.min(16, position.fontSize));
    
    // Hitung ukuran text untuk background
    const textWidth = font.widthOfTextAtSize(nomorText, fontSize);
    const textHeight = fontSize * 1.2; // Sedikit lebih tinggi dari font size

    // Konversi koordinat: PDF menggunakan origin di kiri bawah, sedangkan UI menggunakan origin di kiri atas
    // Jadi kita perlu membalik koordinat Y
    const pdfX = position.x;
    const pdfY = height - position.y - textHeight; // Konversi dari top-left ke bottom-left origin

    // Padding untuk background putih
    const padding = 4;

    // 1. Gambar background putih (rectangle)
    targetPage.drawRectangle({
      x: pdfX - padding,
      y: pdfY - padding,
      width: textWidth + (padding * 2),
      height: textHeight + (padding * 2),
      color: rgb(1, 1, 1), // White background
    });

    // 2. Gambar teks hitam
    targetPage.drawText(nomorText, {
      x: pdfX,
      y: pdfY + (textHeight - fontSize) / 2, // Center vertically dalam box
      size: fontSize,
      font,
      color: rgb(0, 0, 0), // Black text
    });

    console.log(`[LegalisasiPdf] Overlaid nomor surat at page ${position.page}, position (${pdfX}, ${pdfY}), fontSize ${fontSize}`);

    return pdfDoc.save();
  }

  /**
   * Embed stempel UNDIP ke PDF
   * Stempel ditaruh di atas area tanda tangan
   */
  async embedStempelToPdf(pdfBytes: Uint8Array): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1]; // Stempel di halaman terakhir
    const { width, height } = lastPage.getSize();

    // Fetch stempel image
    let stempelImageBytes: Uint8Array;
    try {
      const response = await fetch(UNDIP_STEMPEL_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch stempel: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      stempelImageBytes = new Uint8Array(buffer);
    } catch (error) {
      console.error('Error fetching stempel UNDIP:', error);
      // Gunakan placeholder jika fetch gagal
      throw new Error('Gagal mengambil gambar stempel UNDIP');
    }

    // Embed stempel image
    let stempelImage;
    try {
      stempelImage = await pdfDoc.embedPng(stempelImageBytes);
    } catch {
      // Coba JPG jika PNG gagal
      try {
        stempelImage = await pdfDoc.embedJpg(stempelImageBytes);
      } catch (error) {
        console.error('Error embedding stempel image:', error);
        throw new Error('Gagal embed gambar stempel');
      }
    }

    // Posisi stempel - di atas tanda tangan, agak ke kiri dari tengah
    const stempelX = width - STEMPEL_CONFIG.offsetFromRight - STEMPEL_CONFIG.width;
    const stempelY = STEMPEL_CONFIG.offsetFromBottom;

    lastPage.drawImage(stempelImage, {
      x: stempelX,
      y: stempelY,
      width: STEMPEL_CONFIG.width,
      height: STEMPEL_CONFIG.height,
      opacity: STEMPEL_CONFIG.opacity,
    });

    return pdfDoc.save();
  }

  /**
   * Load UNDIP logo untuk QR Code
   * Menggunakan logo dari folder public atau fallback URL
   */
  private async getLogoForQRCode(): Promise<string | null> {
    try {
      const logoPath = path.join(process.cwd(), 'public', 'logo-undip.png');
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        return `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
      
      // Fallback: coba stempel.png sebagai logo
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
   * Menggunakan canvas untuk overlay logo pada QR Code
   */
  async generateQRCodeWithLogo(
    data: string,
    options: {
      width?: number;
      logoSize?: number; // Persentase dari QR Code (0.2 = 20%)
    } = {}
  ): Promise<string> {
    const width = options.width || 250;
    const logoSizePercent = options.logoSize || 0.26; // 26% dari QR code (lebih besar, lebih jelas)
    
    // Generate QR Code dengan high error correction
    const qrCodeDataUrl = await QRCode.toDataURL(data, {
      errorCorrectionLevel: 'H', // HIGH - bisa terbaca meski 30% tertutup
      type: 'image/png',
      width: width,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    // Load logo
    const logoDataUrl = await this.getLogoForQRCode();
    
    if (!logoDataUrl) {
      // Jika tidak ada logo, return QR tanpa logo
      console.log('[LegalisasiPdf] No logo found, using plain QR Code');
      return qrCodeDataUrl;
    }

    // Gabungkan QR Code dengan logo menggunakan sharp atau canvas
    try {
      const sharp = (await import('sharp')).default;
      
      // Decode base64 QR Code
      const qrBase64 = qrCodeDataUrl.split(',')[1];
      const qrBuffer = Buffer.from(qrBase64, 'base64');
      
      // Decode base64 logo
      const logoBase64 = logoDataUrl.split(',')[1];
      const logoBuffer = Buffer.from(logoBase64, 'base64');
      
      // Calculate logo size and position
      const logoSize = Math.floor(width * logoSizePercent);
      const logoPosition = Math.floor((width - logoSize) / 2);
      
      // White frame padding (8px untuk estetika)
      const framePadding = 8;
      const frameSize = logoSize + (framePadding * 2);
      const framePosition = Math.floor((width - frameSize) / 2);
      
      // Resize logo dengan padding internal untuk white space
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
      
      // Create white background frame
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
      
      // Composite: QR Code + white frame + logo
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
      // Fallback: return QR tanpa logo
      return qrCodeDataUrl;
    }
  }

  /**
   * Generate QR Code untuk verifikasi dokumen
   * UPDATED: Menggunakan SHORT TOKEN untuk QR Code yang mudah di-scan
   */
  async generateVerificationQRCode(documentId: string): Promise<{
    qrCodeDataUrl: string;
    qrCodeBase64: string;
    shortToken: string;
    verificationUrl: string;
  }> {
    // Generate short unique token (8-10 karakter)
    let shortToken = generateShortToken();
    
    // Pastikan token benar-benar unik (cek database)
    let existingDoc = await prisma.letterDocument.findUnique({
      where: { verificationToken: shortToken },
    });
    
    // Jika sudah ada, generate ulang sampai dapat yang unik
    while (existingDoc) {
      shortToken = generateShortToken();
      existingDoc = await prisma.letterDocument.findUnique({
        where: { verificationToken: shortToken },
      });
    }

    // Generate verification URL dengan short token
    const verificationUrl = generateVerificationUrl(shortToken);
    console.log(`[LegalisasiPdf] Short Token: ${shortToken}`);
    console.log(`[LegalisasiPdf] Verification URL: ${verificationUrl} (${verificationUrl.length} chars)`);

    // Generate QR Code dengan logo UNDIP - URL pendek = QR sederhana!
    const qrCodeDataUrl = await this.generateQRCodeWithLogo(verificationUrl, {
      width: 250, // Ukuran lebih besar untuk scannability
      logoSize: 0.26, // Logo 26% dari QR dengan white frame (aman dengan error correction H)
    });

    // Extract base64
    const qrCodeBase64 = qrCodeDataUrl.replace(/^data:image\/png;base64,/, '');

    return {
      qrCodeDataUrl,
      qrCodeBase64,
      shortToken,
      verificationUrl,
    };
  }

  /**
   * Embed QR Code ke semua halaman PDF
   */
  async embedQRCodeToPdf(
    pdfBytes: Uint8Array,
    qrCodeDataUrl: string,
    addToAllPages: boolean = true
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    // Parse QR Code data URL
    let qrImageBytes: Uint8Array;
    try {
      const base64Data = qrCodeDataUrl.split(',')[1];
      qrImageBytes = Buffer.from(base64Data, 'base64');
    } catch (error) {
      console.error('Error parsing QR Code data URL:', error);
      throw new Error('Invalid QR Code data URL');
    }

    // Embed QR Code image
    let qrImage;
    try {
      qrImage = await pdfDoc.embedPng(qrImageBytes);
    } catch {
      try {
        qrImage = await pdfDoc.embedJpg(qrImageBytes);
      } catch (error) {
        console.error('Error embedding QR Code image:', error);
        throw new Error('Gagal embed QR Code');
      }
    }

    // Target pages
    const targetPages = addToAllPages ? pages : [pages[pages.length - 1]];

    // Add QR Code to each page
    for (const page of targetPages) {
      const { width } = page.getSize();

      // Posisi QR Code - pojok kanan bawah
      const qrX = width - QR_CODE_CONFIG.offsetFromRight - QR_CODE_CONFIG.width;
      const qrY = QR_CODE_CONFIG.offsetFromBottom;

      page.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: QR_CODE_CONFIG.width,
        height: QR_CODE_CONFIG.height,
      });
    }

    return pdfDoc.save();
  }

  /**
   * Proses lengkap regenerasi PDF setelah pemberian nomor surat
   * 1. Download PDF existing
   * 2. Generate PDF baru dari template menggunakan Puppeteer
   * 3. Upload PDF baru
   * 4. Return PDF URL (fileUrl akan diupdate oleh repository dalam transaction)
   */
  async regeneratePdfWithNomorSurat(
    documentId: string,
    nomorSurat: string
  ): Promise<string> {
    console.log(`[LegalisasiPdf] Regenerating PDF with nomor surat: ${nomorSurat} for document ${documentId}`);

    // Get document to determine type
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId },
      select: { type: true },
    });

    if (!document) {
      throw new Error('Dokumen tidak ditemukan');
    }

    let html: string;

    // Use appropriate template based on document type
    if (document.type === 'SURAT_KEPUTUSAN') {
      const templateData = await this.buildSuratKeputusanData(documentId, { nomorSurat });
      html = suratKeputusanTemplate(templateData);
    } else {
      const templateData = await this.buildSuratTugasData(documentId, { nomorSurat });
      html = suratTugasTemplate(templateData);
    }

    // Generate PDF dari HTML menggunakan Puppeteer
    const pdfBuffer = await this.generatePdfFromHtml(html);
    console.log(`[LegalisasiPdf] PDF generated, size: ${pdfBuffer.length} bytes`);

    // Upload updated PDF
    const pdfUrl = await this.uploadPdf(
      pdfBuffer,
      `surat_${documentId}_numbered.pdf`
    );
    console.log(`[LegalisasiPdf] PDF uploaded: ${pdfUrl}`);

    // Return URL - fileUrl akan diupdate oleh repository dalam transaction
    return pdfUrl;
  }

  /**
   * Proses lengkap regenerasi PDF setelah pemberian stempel
   * Menggunakan Puppeteer untuk regenerate dari template
   * Return PDF URL (fileUrl akan diupdate oleh repository dalam transaction)
   */
  async regeneratePdfWithStempel(documentId: string): Promise<string> {
    console.log(`[LegalisasiPdf] Regenerating PDF with stempel for document ${documentId}`);

    // Get document to determine type
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId },
      select: { type: true },
    });

    if (!document) {
      throw new Error('Dokumen tidak ditemukan');
    }

    let html: string;

    // Use appropriate template based on document type
    // Note: Surat Keputusan currently doesn't have stempel support in template
    if (document.type === 'SURAT_KEPUTUSAN') {
      const templateData = await this.buildSuratKeputusanData(documentId, {});
      html = suratKeputusanTemplate(templateData);
    } else {
      const templateData = await this.buildSuratTugasData(documentId, {
        stempelUrl: UNDIP_STEMPEL_URL,
      });
      html = suratTugasTemplate(templateData);
    }

    // Generate PDF dari HTML menggunakan Puppeteer
    const pdfBuffer = await this.generatePdfFromHtml(html);
    console.log(`[LegalisasiPdf] PDF with stempel generated, size: ${pdfBuffer.length} bytes`);

    // Upload updated PDF
    const pdfUrl = await this.uploadPdf(
      pdfBuffer,
      `surat_${documentId}_stamped.pdf`
    );
    console.log(`[LegalisasiPdf] PDF uploaded: ${pdfUrl}`);

    // Return URL - fileUrl akan diupdate oleh repository dalam transaction
    return pdfUrl;
  }

  /**
   * Proses lengkap regenerasi PDF setelah generate QR Code
   * Menggunakan Puppeteer untuk regenerate dari template dengan QR Code
   * UPDATED: Menggunakan short token untuk QR Code yang mudah di-scan
   */
  async regeneratePdfWithQRCode(documentId: string): Promise<{
    pdfUrl: string;
    qrCodeUrl: string;
    shortToken: string;
    verificationUrl: string;
  }> {
    console.log(`[LegalisasiPdf] Regenerating PDF with QR Code for document ${documentId}`);

    // Get document data
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error('Dokumen tidak ditemukan');
    }

    if (!document.nomorSurat) {
      throw new Error('Nomor surat belum diberikan');
    }

    // Generate QR Code dengan short token
    const { qrCodeDataUrl, shortToken, verificationUrl } = 
      await this.generateVerificationQRCode(documentId);

    console.log(`[LegalisasiPdf] QR Code generated with short token`);
    console.log(`[LegalisasiPdf] Token: ${shortToken}`);
    console.log(`[LegalisasiPdf] URL: ${verificationUrl} (${verificationUrl.length} chars)`);

    let html: string;

    // Use appropriate template based on document type
    if (document.type === 'SURAT_KEPUTUSAN') {
      const templateData = await this.buildSuratKeputusanData(documentId, { qrCodeDataUrl });
      html = suratKeputusanTemplate(templateData);
    } else {
      // Build data untuk template dengan QR Code dan stempel
      const templateData = await this.buildSuratTugasData(documentId, {
        stempelUrl: UNDIP_STEMPEL_URL,
        qrCodeDataUrl,
      });
      html = suratTugasTemplate(templateData);
    }

    // Generate PDF dari HTML menggunakan Puppeteer
    const pdfBuffer = await this.generatePdfFromHtml(html);
    console.log(`[LegalisasiPdf] PDF with QR Code generated, size: ${pdfBuffer.length} bytes`);

    // Upload updated PDF
    const pdfUrl = await this.uploadPdf(
      pdfBuffer,
      `surat_${documentId}_final.pdf`
    );
    console.log(`[LegalisasiPdf] PDF uploaded: ${pdfUrl}`);

    // Return all data - fileUrl dan verificationToken akan diupdate oleh repository dalam transaction
    return { pdfUrl, qrCodeUrl: qrCodeDataUrl, shortToken, verificationUrl };
  }

  /**
   * Overlay nomor surat ke PDF pada posisi yang ditentukan user
   * Menggunakan teknik overlay dengan background putih dan teks hitam
   * 
   * @param documentId - ID dokumen
   * @param nomorSurat - Nomor surat yang akan di-overlay
   * @param position - Posisi overlay {x, y, page, fontSize}
   * @returns URL PDF yang sudah dimodifikasi
   */
  async overlayNomorSuratWithPosition(
    documentId: string,
    nomorSurat: string,
    position: {
      x: number;
      y: number;
      page: number;
      fontSize: number;
    }
  ): Promise<string> {
    console.log(`[LegalisasiPdf] Overlaying nomor surat: ${nomorSurat} at position (${position.x}, ${position.y}) for document ${documentId}`);

    // Get existing document with signatures
    const document = await prisma.letterDocument.findUnique({
      where: { id: documentId },
      include: {
        signatures: {
          where: { status: 'SIGNED' },
          orderBy: { order: 'asc' },
        },
        letterInstance: {
          include: {
            createdBy: {
              include: {
                mahasiswa: { include: { programStudi: true } },
                pegawai: { include: { programStudi: true } },
              },
            },
            letterType: true,
          },
        },
      },
    });

    if (!document) {
      throw new Error('Dokumen tidak ditemukan');
    }

    // Get or generate PDF bytes
    let existingPdfBytes: Uint8Array;
    
    if (!document.fileUrl) {
      // No file URL exists - generate PDF from template first
      console.log(`[LegalisasiPdf] No fileUrl found, generating PDF from template for document ${documentId}`);
      
      try {
        let html: string;

        // Use appropriate template based on document type
        if (document.type === 'SURAT_KEPUTUSAN') {
          const templateData = await this.buildSuratKeputusanData(documentId, { nomorSurat });
          html = suratKeputusanTemplate(templateData);
        } else {
          const templateData = await this.buildSuratTugasData(documentId, { nomorSurat });
          html = suratTugasTemplate(templateData);
        }

        // Generate PDF from HTML using Puppeteer
        const pdfBuffer = await this.generatePdfFromHtml(html);
        console.log(`[LegalisasiPdf] PDF generated from template, size: ${pdfBuffer.length} bytes`);
        
        existingPdfBytes = new Uint8Array(pdfBuffer);
        
        // Since we're generating from template with nomor surat already embedded,
        // we don't need to overlay - just upload the generated PDF
        const pdfUrl = await this.uploadPdf(
          pdfBuffer,
          `surat_${documentId}_numbered.pdf`
        );
        console.log(`[LegalisasiPdf] PDF from template uploaded: ${pdfUrl}`);

        // Update fileUrl in database
        await prisma.letterDocument.update({
          where: { id: documentId },
          data: {
            fileUrl: pdfUrl,
          },
        });

        return pdfUrl;
      } catch (error) {
        console.error('[LegalisasiPdf] Error generating PDF from template:', error);
        throw new Error(`Gagal meng-generate PDF dari template: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // File URL exists - download existing PDF and overlay
    try {
      let pdfBuffer: Buffer;
      if (document.fileUrl.startsWith('http')) {
        // Legacy: it's already a full URL
        const response = await fetch(document.fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        pdfBuffer = Buffer.from(buffer);
      } else {
        // It's a storage path - download directly from MinIO
        pdfBuffer = await this.minioService.downloadFile(document.fileUrl);
      }
      existingPdfBytes = new Uint8Array(pdfBuffer);
    } catch (error) {
      console.error('Error fetching existing PDF:', error);
      throw new Error('Gagal mengunduh PDF existing');
    }

    // Apply overlay
    const modifiedPdfBytes = await this.overlayNomorSuratAtPosition(
      existingPdfBytes,
      nomorSurat,
      position
    );

    // Upload modified PDF
    const pdfUrl = await this.uploadPdf(
      Buffer.from(modifiedPdfBytes),
      `surat_${documentId}_numbered.pdf`
    );
    console.log(`[LegalisasiPdf] PDF with overlay uploaded: ${pdfUrl}`);

    // Update fileUrl in database
    await prisma.letterDocument.update({
      where: { id: documentId },
      data: {
        fileUrl: pdfUrl,
      },
    });

    return pdfUrl;
  }

  /**
   * Upload PDF ke MinIO storage
   * Returns storage path (NOT signed URL) for database storage
   * Signed URLs will be generated on-demand when accessing
   */
  private async uploadPdf(pdfBuffer: Buffer, fileName: string): Promise<string> {
    console.log(`[LegalisasiPdf] uploadPdf called with fileName: ${fileName}`);
    
    const uploadResult = await this.minioService.uploadFile(
      pdfBuffer,
      fileName,
      'application/pdf',
      'documents'
    );
    console.log(`[LegalisasiPdf] Upload complete, storage path: ${uploadResult.path}`);

    // Return storage path (NOT signed URL) - this will be stored in database
    // Signed URLs will be generated on-demand by submission.service.ts
    return uploadResult.path;
  }
}

export const legalisasiPdfService = new LegalisasiPdfService();
