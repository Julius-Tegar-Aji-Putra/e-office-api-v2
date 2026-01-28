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

export interface EmbedSignatureOptions {
  pdfBytes: Uint8Array;
  signatures: SignaturePosition[];
  signatureWidth?: number;
  signatureHeight?: number;
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
