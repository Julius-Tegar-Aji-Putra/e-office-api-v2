/**
 * Legalisasi Routes
 * Elysia route definitions untuk modul UPA (penomoran, stempel, finalisasi)
 */

import { Elysia } from 'elysia';
import { legalisasiController } from './legalisasi.controller';
import {
  legalisasiQuerySchema,
  idParamSchema,
  documentTypeParamSchema,
  assignNumberSchema,
  finalizeDocumentSchema,
  letterListResponseSchema,
  letterDetailResponseSchema,
  recentNumbersResponseSchema,
  tembusanResponseSchema,
  errorResponseSchema
} from './legalisasi.validation';
import { authGuardPlugin } from '../../middlewares/auth';

export const legalisasiRoute = new Elysia({ prefix: '/legalisasi' })
  .use(authGuardPlugin)
  .get(
    '/queue',
    (ctx) => legalisasiController.getQueue(ctx as any),
    {
      query: legalisasiQuerySchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Get UPA processing queue',
        description: 'Get list of letters waiting for UPA processing (numbering, stamping, finalizing)'
      }
    }
  )
  .get(
    '/recent-numbers/:type',
    (ctx) => legalisasiController.getRecentNumbers(ctx as any),
    {
      params: documentTypeParamSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Get recent nomor surat',
        description: 'Get recent nomor surat for reference when assigning new number'
      }
    }
  )
  .get(
    '/:id',
    (ctx) => legalisasiController.getLetterDetail(ctx as any),
    {
      params: idParamSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Get letter detail',
        description: 'Get detailed information about a letter for UPA processing'
      }
    }
  )
  .get(
    '/:id/tembusan',
    (ctx) => legalisasiController.getTembusanRecipients(ctx as any),
    {
      params: idParamSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Get tembusan recipients',
        description: 'Get list of tembusan recipients for distribution'
      }
    }
  )
  .post(
    '/:id/assign-number',
    (ctx) => legalisasiController.assignNumber(ctx as any),
    {
      params: idParamSchema,
      body: assignNumberSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Assign nomor surat',
        description: 'Assign official letter number to a document'
      }
    }
  )
  .post(
    '/:id/stamp',
    (ctx) => legalisasiController.applyStamp(ctx as any),
    {
      params: idParamSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Apply stamp',
        description: 'Apply official stamp to the document (positioned left of highest signatory)'
      }
    }
  )
  .post(
    '/:id/finalize',
    (ctx) => legalisasiController.finalizeDocument(ctx as any),
    {
      params: idParamSchema,
      body: finalizeDocumentSchema,
      detail: {
        tags: ['Legalisasi'],
        summary: 'Finalize document',
        description: 'Finalize document by generating QR code and final PDF. Status becomes COMPLETED.'
      }
    }
  );

export default legalisasiRoute;
