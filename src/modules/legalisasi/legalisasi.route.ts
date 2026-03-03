/**
 * Legalisasi Routes
 * Elysia route definitions untuk modul UPA (penomoran, stempel, QR code, finalisasi)
 */

import { Elysia } from 'elysia';
import { legalisasiService } from './legalisasi.service';
import {
  legalisasiQueueQuerySchema,
  usedNumbersQuerySchema,
  idParamSchema,
  documentIdParamSchema,
  assignNumberSchema,
  applyStempelSchema,
} from './legalisasi.validation';
import { authGuardPlugin } from '../../middlewares/auth';
import { getUserRoles } from '../../lib/casbin';

export const legalisasiRoute = new Elysia({ prefix: '/legalisasi' })
  .use(authGuardPlugin)

  // =========================================================================
  // QUEUE & DASHBOARD
  // =========================================================================

  .get(
    '/queue',
    async ({ query, user }) => {
      const roles = await getUserRoles(user.id);
      const activeRole = roles.includes('UPA') ? 'UPA' :
        roles.includes('ADMIN') ? 'ADMIN' :
          roles.includes('SUPERADMIN') ? 'SUPERADMIN' : roles[0];

      const params = {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 10,
        status: query.status as any,
        legalisasiStatus: query.legalisasiStatus as any,
        kategori: query.kategori as any,
        search: query.search
      };

      const result = await legalisasiService.getUPAQueue(params, user.id, activeRole);
      return result;
    },
    {
      query: legalisasiQueueQuerySchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Get UPA processing queue',
        description: 'Get list of letters waiting for UPA processing (numbering, stamping, QR, finalizing)'
      }
    }
  )

  // =========================================================================
  // NUMBER MANAGEMENT
  // =========================================================================

  .get(
    '/check-number',
    async ({ query, user }) => {
      const roles = await getUserRoles(user.id);
      const activeRole = roles.includes('UPA') ? 'UPA' : roles[0];

      const nomorSurat = (query as any).nomorSurat as string;
      if (!nomorSurat) {
        return { success: false, error: 'Parameter nomorSurat wajib diisi' };
      }

      return legalisasiService.checkNomorSurat(nomorSurat, user.id, activeRole);
    },
    {
      detail: {
        tags: ['Legalisasi'],
        summary: 'Check nomor surat availability',
        description: 'Check if a nomor surat is available and get suggestion for next number'
      }
    }
  )

  .get(
    '/used-numbers',
    async ({ query, user }) => {
      const roles = await getUserRoles(user.id);
      const activeRole = roles.includes('UPA') ? 'UPA' : roles[0];

      const params = {
        page: query.page ? parseInt(query.page) : 1,
        limit: query.limit ? parseInt(query.limit) : 20,
        year: query.year ? parseInt(query.year) : undefined,
        search: query.search
      };

      return legalisasiService.getUsedNumbers(params, user.id, activeRole);
    },
    {
      query: usedNumbersQuerySchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Get used nomor surat list',
        description: 'Get list of nomor surat that have been used (for audit/reference)'
      }
    }
  )

  // =========================================================================
  // LETTER DETAIL
  // =========================================================================

  .get(
    '/:id',
    async ({ params, user }) => {
      const roles = await getUserRoles(user.id);
      const activeRole = roles.includes('UPA') ? 'UPA' : roles[0];

      return legalisasiService.getLetterDetail(params.id, user.id, activeRole);
    },
    {
      params: idParamSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Get letter detail for legalisasi',
        description: 'Get detailed information about a letter for UPA processing'
      }
    }
  )

  // =========================================================================
  // DOCUMENT ACTIONS (by documentId)
  // =========================================================================

  .post(
    '/document/:documentId/assign-number',
    async ({ params, body, user }) => {
      const roles = await getUserRoles(user.id);
      const activeRole = roles.includes('UPA') ? 'UPA' : roles[0];

      if (!body.nomorSurat || !body.tanggalSurat) {
        return { success: false, error: 'Field nomorSurat dan tanggalSurat wajib diisi' };
      }

      return legalisasiService.assignNomorSurat(
        {
          documentId: params.documentId,
          nomorSurat: body.nomorSurat,
          tanggalSurat: new Date(body.tanggalSurat),
          position: body.position // Pass position data for PDF overlay
        },
        user.id,
        activeRole
      );
    },
    {
      params: documentIdParamSchema,
      body: assignNumberSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Assign nomor surat',
        description: 'Assign official letter number to a document. Status changes to UPA_STAMPING.'
      }
    }
  )

  .post(
    '/document/:documentId/stamp',
    async ({ params, body, user }) => {
      const roles = await getUserRoles(user.id);
      const activeRole = roles.includes('UPA') ? 'UPA' : roles[0];

      return legalisasiService.applyStempel(
        {
          documentId: params.documentId,
          sealImageUrl: body?.sealImageUrl,
          sealTargetRole: body?.sealTargetRole
        },
        user.id,
        activeRole
      );
    },
    {
      params: documentIdParamSchema,
      body: applyStempelSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Apply stempel',
        description: 'Apply official stamp to the document (positioned near highest signatory). Status changes to UPA_FINALIZING.'
      }
    }
  )

  .post(
    '/document/:documentId/generate-qr',
    async ({ params, user }) => {
      const roles = await getUserRoles(user.id);
      const activeRole = roles.includes('UPA') ? 'UPA' : roles[0];

      return legalisasiService.generateQRCode(params.documentId, user.id, activeRole);
    },
    {
      params: documentIdParamSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Generate QR code',
        description: 'Generate encrypted QR code for document verification. Returns QR image and verification URL.'
      }
    }
  )

  .post(
    '/document/:documentId/finalize',
    async ({ params, body, user }) => {
      const roles = await getUserRoles(user.id);
      const activeRole = roles.includes('UPA') ? 'UPA' : roles[0];

      // Handle multipart form data with PDF file
      const pdfFile = (body as any)?.pdfFile;
      const notes = (body as any)?.notes;
      const fileUrl = (body as any)?.fileUrl;

      let pdfBuffer: Buffer | undefined;
      if (pdfFile) {
        // pdfFile is a File/Blob from multipart upload
        const arrayBuffer = await pdfFile.arrayBuffer();
        pdfBuffer = Buffer.from(arrayBuffer);
      }

      return legalisasiService.finalizeDocument(
        {
          documentId: params.documentId,
          fileUrl: fileUrl || '',
          notes: notes || 'Surat telah selesai diproses',
          pdfBuffer
        },
        user.id,
        activeRole
      );
    },
    {
      params: documentIdParamSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Finalize document',
        description: 'Finalize document by uploading final PDF from frontend. Status becomes COMPLETED and letter is ready for distribution.'
      }
    }
  )

  .get(
    '/document/:documentId/tembusan',
    async ({ params, user }) => {
      const roles = await getUserRoles(user.id);
      const activeRole = roles.includes('UPA') ? 'UPA' : roles[0];

      return legalisasiService.getTembusanRecipients(params.documentId, user.id, activeRole);
    },
    {
      params: documentIdParamSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Get tembusan recipients',
        description: 'Get list of tembusan recipients for a document'
      }
    }
  )

  // =========================================================================
  // PDF PROXY - Serve PDF files directly to avoid signed URL issues
  // =========================================================================

  .get(
    '/document/:documentId/pdf',
    async ({ params, user, set }) => {
      const roles = await getUserRoles(user.id);
      const activeRole = roles.includes('UPA') ? 'UPA' : roles[0];

      const result = await legalisasiService.getDocumentPdf(params.documentId, user.id, activeRole);

      if (!result.success) {
        set.status = result.code || 404;
        return { success: false, error: result.error };
      }

      set.headers['Content-Type'] = 'application/pdf';
      set.headers['Content-Disposition'] = `inline; filename="${result.filename}"`;

      return result.data;
    },
    {
      params: documentIdParamSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Get document PDF',
        description: 'Stream PDF file directly from storage'
      }
    }
  );

export default legalisasiRoute;
