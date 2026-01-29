/**
 * PDF Generator Utility
 * Handles PDF generation with embedded signatures at specified positions
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface SignaturePosition {
  signatureUrl: string;
  positionX: number;
  positionY: number;
  positionPage: number;
  signerName: string;
  signerRole: string;
  signerNip?: string;
}

export interface SignaturePlaceholder {
  positionX: number;
  positionY: number;
  positionPage: number;
  signerName: string;
  signerRole: string;
  signerNip?: string;
  order: number;
}

export interface EmbedSignatureOptions {
  pdfBytes: Uint8Array;
  signatures: SignaturePosition[];
  signatureWidth?: number;
  signatureHeight?: number;
}

export interface EmbedSignaturePlaceholdersOptions {
  pdfBytes: Uint8Array;
  placeholders: SignaturePlaceholder[];
  blockWidth?: number;
  blockHeight?: number;
}

export interface UpdateNomorSuratOptions {
  pdfBytes: Uint8Array;
  nomorSurat: string;
  /** X position to start drawing the nomor surat text */
  x?: number;
  /** Y position from top of page */
  y?: number;
  /** Page number (1-indexed) */
  page?: number;
}

/**
 * Embed signatures into PDF at specified positions
 */
export async function embedSignaturesIntoPdf(options: EmbedSignatureOptions): Promise<Uint8Array> {
  const { pdfBytes, signatures, signatureWidth = 100, signatureHeight = 50 } = options;

  // Load the PDF
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  // Embed font for text
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const sig of signatures) {
    // Validate page number
    const pageIndex = (sig.positionPage || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) {
      console.warn(`Invalid page number ${sig.positionPage} for signature, skipping`);
      continue;
    }

    const page = pages[pageIndex];
    const pageHeight = page.getHeight();

    // Convert Y coordinate (origin at bottom-left in PDF)
    // Frontend uses top-left origin, so we need to flip Y
    const pdfY = pageHeight - sig.positionY - signatureHeight;

    try {
      // Embed signature image
      if (sig.signatureUrl) {
        const signatureBytes = await fetchSignatureImage(sig.signatureUrl);
        if (signatureBytes) {
          const signatureImage = await embedImageByType(pdfDoc, signatureBytes, sig.signatureUrl);
          if (signatureImage) {
            page.drawImage(signatureImage, {
              x: sig.positionX,
              y: pdfY,
              width: signatureWidth,
              height: signatureHeight,
            });
          }
        }
      }

      // Draw signer name below signature
      const nameY = pdfY - 15;
      page.drawText(sig.signerName, {
        x: sig.positionX,
        y: nameY,
        size: 10,
        font,
        color: rgb(0, 0, 0),
      });

      // Draw NIP if available
      if (sig.signerNip) {
        const nipY = nameY - 12;
        page.drawText(`NIP. ${sig.signerNip}`, {
          x: sig.positionX,
          y: nipY,
          size: 8,
          font,
          color: rgb(0, 0, 0),
        });
      }
    } catch (error) {
      console.error(`Error embedding signature for ${sig.signerName}:`, error);
    }
  }

  return pdfDoc.save();
}

/**
 * Embed signature placeholder blocks into PDF at specified positions
 * These are the "boxes" that show where signatures will be placed,
 * containing role, placeholder line, name, and NIP
 */
export async function embedSignaturePlaceholdersIntoPdf(options: EmbedSignaturePlaceholdersOptions): Promise<Uint8Array> {
  const { pdfBytes, placeholders, blockWidth = 160, blockHeight = 80 } = options;

  // Load the PDF
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  // Embed fonts
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  // Sort placeholders by order
  const sortedPlaceholders = [...placeholders].sort((a, b) => a.order - b.order);

  for (const placeholder of sortedPlaceholders) {
    // Validate page number
    const pageIndex = (placeholder.positionPage || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) {
      console.warn(`Invalid page number ${placeholder.positionPage} for placeholder, skipping`);
      continue;
    }

    const page = pages[pageIndex];
    const pageHeight = page.getHeight();

    // Convert Y coordinate (origin at bottom-left in PDF)
    // Frontend uses top-left origin, so we need to flip Y
    const pdfY = pageHeight - placeholder.positionY - blockHeight;

    try {
      const x = placeholder.positionX;
      let currentY = pdfY + blockHeight - 12; // Start from top of block

      // Draw role/position title (e.g., "Dekan")
      page.drawText(placeholder.signerRole, {
        x,
        y: currentY,
        size: 11,
        font: fontBold,
        color: rgb(0, 0, 0),
      });
      currentY -= 20;

      // Draw placeholder line for signature (dashed line effect using dots/dashes)
      // We'll draw a simple underline to indicate signature area
      const lineY = currentY + 5;
      const lineWidth = blockWidth - 20;
      page.drawLine({
        start: { x, y: lineY },
        end: { x: x + lineWidth, y: lineY },
        thickness: 0.5,
        color: rgb(0.5, 0.5, 0.5),
        dashArray: [3, 3],
      });
      currentY -= 25;

      // Draw signer name with underline
      const displayName = placeholder.signerName || '(Nama Pejabat)';
      page.drawText(displayName, {
        x,
        y: currentY,
        size: 11,
        font,
        color: rgb(0, 0, 0),
      });
      
      // Underline the name
      const nameWidth = font.widthOfTextAtSize(displayName, 11);
      page.drawLine({
        start: { x, y: currentY - 2 },
        end: { x: x + nameWidth, y: currentY - 2 },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      });
      currentY -= 14;

      // Draw NIP if available
      if (placeholder.signerNip) {
        page.drawText(`NIP. ${placeholder.signerNip}`, {
          x,
          y: currentY,
          size: 9,
          font,
          color: rgb(0, 0, 0),
        });
      }
    } catch (error) {
      console.error(`Error embedding placeholder for ${placeholder.signerName}:`, error);
    }
  }

  return pdfDoc.save();
}

/**
 * Fetch signature image from URL
 */
async function fetchSignatureImage(url: string): Promise<Uint8Array | null> {
  try {
    // Handle data URLs
    if (url.startsWith('data:')) {
      const base64Data = url.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    }

    // Fetch from URL
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch signature image: ${response.statusText}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error('Error fetching signature image:', error);
    return null;
  }
}

/**
 * Embed image based on file type
 */
async function embedImageByType(
  pdfDoc: PDFDocument,
  imageBytes: Uint8Array,
  url: string
) {
  const isPng = url.toLowerCase().includes('.png') || url.startsWith('data:image/png');
  
  try {
    if (isPng) {
      return await pdfDoc.embedPng(imageBytes);
    } else {
      return await pdfDoc.embedJpg(imageBytes);
    }
  } catch (error) {
    // Try the other format if first attempt fails
    try {
      if (isPng) {
        return await pdfDoc.embedJpg(imageBytes);
      } else {
        return await pdfDoc.embedPng(imageBytes);
      }
    } catch {
      console.error('Could not embed image in either PNG or JPG format');
      return null;
    }
  }
}

/**
 * Create a simple PDF from HTML content (basic implementation)
 * For complex HTML, consider using puppeteer or similar
 */
export async function createBasicPdf(content: {
  title?: string;
  body: string;
  paperSize?: 'A4' | 'LETTER';
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // A4 size: 595.28 x 841.89 points
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { height } = page.getSize();
  
  let y = height - 50;

  // Draw title if provided
  if (content.title) {
    page.drawText(content.title, {
      x: 50,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= 30;
  }

  // Simple text rendering (basic implementation)
  // For proper HTML rendering, use a library like puppeteer
  const lines = content.body.replace(/<[^>]*>/g, '\n').split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    if (y < 50) {
      // Add new page if needed
      const newPage = pdfDoc.addPage([595.28, 841.89]);
      y = height - 50;
    }

    page.drawText(line.trim().substring(0, 80), {
      x: 50,
      y,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 15;
  }

  return pdfDoc.save();
}

/**
 * Update nomor surat in an existing PDF
 * Uses overlay approach: covers "undefined" with white and draws new text
 * 
 * The function searches for the approximate position of "Nomor" text
 * and overlays the new nomor surat value.
 * 
 * For Surat Tugas/SK templates, the "Nomor : xxx" is typically:
 * - Centered horizontally
 * - About 200pt from the top (below the "SURAT TUGAS" title)
 */
export async function updateNomorSuratInPdf(options: UpdateNomorSuratOptions): Promise<Uint8Array> {
  const { pdfBytes, nomorSurat, page = 1 } = options;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  
  const pageIndex = page - 1;
  if (pageIndex < 0 || pageIndex >= pages.length) {
    console.warn(`Invalid page number ${page}, using first page`);
  }

  const targetPage = pages[Math.max(0, Math.min(pageIndex, pages.length - 1))];
  const { width, height } = targetPage.getSize();

  // Embed fonts
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  // Standard position for "Nomor" in Surat Tugas template
  // Based on FSM UNDIP template layout:
  // - Title "SURAT TUGAS" is underlined and centered
  // - "Nomor : undefined" is directly below it, also centered
  
  // Y position - approximately 200pt from top for this template
  // In PDF coordinates (from bottom), that's height - 200
  const nomorY = options.y !== undefined 
    ? height - options.y 
    : height - 200;

  // Calculate center position for the new text
  const nomorText = `Nomor : ${nomorSurat}`;
  const textWidth = font.widthOfTextAtSize(nomorText, 11);
  const centerX = options.x !== undefined 
    ? options.x 
    : (width - textWidth) / 2;

  // Cover the old "Nomor : undefined" with white rectangle
  // Make it wide enough to cover any existing nomor text
  const coverWidth = 250; // Wide enough to cover "Nomor : undefined" or any long number
  const coverX = (width - coverWidth) / 2;
  
  targetPage.drawRectangle({
    x: coverX,
    y: nomorY - 4,
    width: coverWidth,
    height: 18,
    color: rgb(1, 1, 1), // White
    opacity: 1,
  });

  // Draw the complete "Nomor : [nomor surat]" text, centered
  targetPage.drawText(nomorText, {
    x: centerX,
    y: nomorY,
    size: 11,
    font,
    color: rgb(0, 0, 0),
  });

  return pdfDoc.save();
}
