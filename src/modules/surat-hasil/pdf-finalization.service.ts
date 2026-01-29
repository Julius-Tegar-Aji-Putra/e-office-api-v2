/**
 * PDF Finalization Service
 * Handles generating final PDF with embedded signatures
 */

import { prisma } from '../../db';
import { embedSignaturesIntoPdf, SignaturePosition } from '../../shared/utils/pdf-generator';
import { SignatureStatus, DocumentType } from '../../generated/prisma/client';

export interface FinalizeDocumentPdfInput {
  documentId: string;
}

export interface FinalizeDocumentPdfResult {
  success: boolean;
  fileUrl?: string;
  error?: string;
}

class PdfFinalizationService {
  /**
   * Generate final PDF with embedded signatures for a fully signed document
   */
  async finalizeDocumentPdf(documentId: string): Promise<FinalizeDocumentPdfResult> {
    try {
      // Get document with signatures
      const document = await prisma.letterDocument.findUnique({
        where: { id: documentId },
        include: {
          signatures: {
            orderBy: { order: 'asc' },
          },
          letterInstance: true,
        },
      });

      if (!document) {
        return { success: false, error: 'Document not found' };
      }

      // Check if all signatures are complete
      const allSigned = document.signatures.every(
        (sig) => sig.status === SignatureStatus.SIGNED && sig.signatureUrl
      );

      if (!allSigned) {
        return { success: false, error: 'Not all signatures are complete' };
      }

      // If document already has a PDF file, load and embed signatures
      // Otherwise, we need to generate PDF from HTML content first
      let basePdfBytes: Uint8Array | null = null;

      if (document.fileUrl) {
        // Fetch existing PDF - get signed URL if fileUrl is storage path
        try {
          let pdfUrl = document.fileUrl;
          if (!pdfUrl.startsWith('http')) {
            // Import MinioService dynamically to avoid circular deps
            const { MinioService } = await import('../../shared/services/minio.service');
            const minio = new MinioService();
            pdfUrl = await minio.getFileUrl(pdfUrl);
          }
          const response = await fetch(pdfUrl);
          if (response.ok) {
            basePdfBytes = new Uint8Array(await response.arrayBuffer());
          }
        } catch (error) {
          console.error('Failed to fetch existing PDF:', error);
        }
      }

      if (!basePdfBytes) {
        // No base PDF available - would need to generate from HTML
        // For now, return success but note that PDF generation from HTML
        // requires additional setup (e.g., puppeteer)
        console.log('No base PDF available for document:', documentId);
        return { 
          success: true, 
          error: 'PDF generation from HTML not yet implemented - signatures stored in database'
        };
      }

      // Prepare signature positions
      const signatures: SignaturePosition[] = document.signatures
        .filter(sig => sig.signatureUrl)
        .map(sig => ({
          signatureUrl: sig.signatureUrl!,
          positionX: sig.positionX ?? 50,
          positionY: sig.positionY ?? 700,
          positionPage: sig.positionPage ?? 1,
          signerName: sig.signerName ?? '',
          signerRole: sig.signerRole,
          signerNip: sig.signerNip ?? undefined,
        }));

      // Embed signatures into PDF
      const finalPdfBytes = await embedSignaturesIntoPdf({
        pdfBytes: basePdfBytes,
        signatures,
        signatureWidth: 100,
        signatureHeight: 50,
      });

      // TODO: Upload to storage (S3, local, etc.) and get URL
      // For now, we just return success
      // const fileUrl = await uploadToStorage(finalPdfBytes, `signed-${documentId}.pdf`);
      
      return { 
        success: true,
        // fileUrl: fileUrl,
      };

    } catch (error) {
      console.error('Error finalizing document PDF:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Get signature positions for a document
   */
  async getSignaturePositions(documentId: string): Promise<SignaturePosition[]> {
    const signatures = await prisma.documentSignature.findMany({
      where: { documentId },
      orderBy: { order: 'asc' },
    });

    return signatures.map(sig => ({
      signatureUrl: sig.signatureUrl ?? '',
      positionX: sig.positionX ?? 50,
      positionY: sig.positionY ?? 700,
      positionPage: sig.positionPage ?? 1,
      signerName: sig.signerName ?? '',
      signerRole: sig.signerRole,
      signerNip: sig.signerNip ?? undefined,
    }));
  }
}

export const pdfFinalizationService = new PdfFinalizationService();
