/**
 * Tembusan Routes
 * API routes untuk fitur tembusan (surat yang diterima sebagai tembusan)
 * 
 * Updated to use user-based tembusan access:
 * - Submitter (pengaju) automatically has access to completed letters
 * - Users in tembusan list have access to completed letters
 */

import { Elysia, t } from 'elysia';
import { tembusanServiceV2 } from './tembusan-v2.service';
import { authGuardPlugin } from '../../middlewares/auth';

export const tembusanRoute = new Elysia({ prefix: '/api/tembusan' })
  .use(authGuardPlugin)
  
  /**
   * GET /api/tembusan/inbox
   * Get daftar surat yang diterima sebagai tembusan
   * 
   * Includes:
   * - Letters submitted by the user (automatically)
   * - Letters where user is explicitly in tembusan list
   */
  .get('/inbox', async ({ user, query }) => {
    return tembusanServiceV2.getInbox(
      {
        page: query.page ? parseInt(query.page as string) : 1,
        limit: query.limit ? parseInt(query.limit as string) : 10,
        search: query.search as string | undefined,
        status: query.status as string | undefined,
        sortBy: query.sortBy as string | undefined,
        sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
      },
      user.id
    );
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      search: t.Optional(t.String()),
      status: t.Optional(t.String()),
      sortBy: t.Optional(t.String()),
      sortOrder: t.Optional(t.String()),
    }),
  })

  /**
   * GET /api/tembusan/count
   * Get jumlah surat tembusan yang belum dibaca
   */
  .get('/count', async ({ user }) => {
    return tembusanServiceV2.getUnreadCount(user.id);
  })

  /**
   * GET /api/tembusan/:id
   * Get detail surat tembusan
   */
  .get('/:id', async ({ user, params }) => {
    return tembusanServiceV2.getDetail(params.id, user.id);
  }, {
    params: t.Object({
      id: t.String(),
    }),
  })

  /**
   * POST /api/tembusan/:id/mark-read
   * Mark surat tembusan sebagai sudah dibaca
   */
  .post('/:id/mark-read', async ({ user, params }) => {
    return tembusanServiceV2.markAsRead(params.id, user.id);
  }, {
    params: t.Object({
      id: t.String(),
    }),
  })

  /**
   * GET /api/tembusan/:id/can-download
   * Check if user can download the document
   */
  .get('/:id/can-download', async ({ user, params }) => {
    return tembusanServiceV2.canDownloadDocument(params.id, user.id);
  }, {
    params: t.Object({
      id: t.String(),
    }),
  });
