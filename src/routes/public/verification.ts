/**
 * Public Verification Routes
 * Endpoint publik untuk verifikasi dokumen via QR Code
 * TIDAK memerlukan autentikasi
 */

import { Elysia, t } from 'elysia';
import { legalisasiService } from '../../modules/legalisasi/legalisasi.service';
import { verifyTokenQuerySchema, verificationResponseSchema } from '../../modules/legalisasi/legalisasi.validation';

export const verificationRoute = new Elysia({ prefix: '/verification' })
  
  /**
   * GET /verify - Verify document from QR code token
   * 
   * Endpoint ini dipanggil ketika seseorang scan QR Code pada dokumen.
   * Token di-decrypt dan data dokumen divalidasi terhadap database.
   * 
   * Response:
   * - valid: true  → Dokumen ASLI, terdaftar di sistem
   * - valid: false → Dokumen PALSU atau tidak ditemukan
   */
  .get(
    '/verify',
    async (ctx) => {
      const { token } = ctx.query as { token: string };
      
      if (!token) {
        return {
          valid: false,
          status: 'INVALID_TOKEN',
          message: '❌ Token verifikasi tidak ditemukan. Silakan scan ulang QR Code.'
        };
      }

      const result = await legalisasiService.verifyDocument(token);

      // Return verification result directly (no wrapper)
      if (result.success && result.data) {
        return result.data;
      }

      return {
        valid: false,
        status: 'INVALID_TOKEN',
        message: '❌ Terjadi kesalahan saat verifikasi.'
      };
    },
    {
      query: verifyTokenQuerySchema,
      detail: {
        tags: ['Public', 'Verification'],
        summary: 'Verify document authenticity',
        description: `
          Public endpoint untuk memverifikasi keaslian dokumen melalui QR Code.
          
          **Cara Kerja:**
          1. QR Code berisi URL dengan token terenkripsi
          2. Token di-decrypt menggunakan APP_KEY
          3. Data dokumen divalidasi terhadap database
          4. Response berisi status keaslian dan detail dokumen
          
          **Response Status:**
          - VERIFIED: Dokumen asli dan terdaftar
          - NOT_FOUND: Dokumen tidak ditemukan (kemungkinan palsu)
          - INVALID_TOKEN: QR Code tidak valid/rusak/palsu
          - EXPIRED: Token sudah kedaluwarsa (jika ada time-based validation)
        `
      }
    }
  )

  /**
   * GET /info - Get verification info page data
   * 
   * Menampilkan informasi tentang sistem verifikasi
   */
  .get(
    '/info',
    () => {
      return {
        success: true,
        data: {
          system: 'E-Office Fakultas Sains dan Matematika UNDIP',
          version: '2.0.0',
          description: 'Sistem Verifikasi Dokumen Digital',
          howToVerify: [
            '1. Scan QR Code pada dokumen menggunakan aplikasi scanner',
            '2. Buka link yang muncul dari hasil scan',
            '3. Sistem akan menampilkan status keaslian dokumen',
            '4. Jika valid, detail dokumen akan ditampilkan'
          ],
          contact: {
            unit: 'Fakultas Sains dan Matematika UNDIP',
            email: 'tu@fsm.undip.ac.id',
            phone: '(024) 7474754'
          },
          validationNote: 'Dokumen yang valid akan menampilkan: Nomor Surat, Tanggal, Perihal, dan Penandatangan'
        }
      };
    },
    {
      detail: {
        tags: ['Public', 'Verification'],
        summary: 'Get verification system info',
        description: 'Get information about the document verification system'
      }
    }
  );

export default verificationRoute;
