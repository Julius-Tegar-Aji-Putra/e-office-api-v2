/**
 * Tembusan Routes
 * API routes untuk fitur tembusan (surat yang diterima sebagai tembusan)
 */

import { Elysia, t } from 'elysia';
import { tembusanService } from './tembusan.service';
import { authGuardPlugin } from '../../middlewares/auth';
import { getUserRoles } from '../../lib/casbin';

export const tembusanRoute = new Elysia({ prefix: '/api/tembusan' })
  .use(authGuardPlugin)
  
  /**
   * GET /api/tembusan/inbox
   * Get daftar surat yang diterima sebagai tembusan
   */
  .get('/inbox', async ({ user, query }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles[0] || 'MAHASISWA';

    return tembusanService.getInbox(
      {
        page: query.page ? parseInt(query.page as string) : 1,
        limit: query.limit ? parseInt(query.limit as string) : 10,
        search: query.search as string | undefined,
        status: query.status as string | undefined,
        sortBy: query.sortBy as string | undefined,
        sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
      },
      user.id,
      activeRole
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
    const roles = await getUserRoles(user.id);
    const activeRole = roles[0] || 'MAHASISWA';

    return tembusanService.getUnreadCount(user.id, activeRole);
  })

  /**
   * GET /api/tembusan/:id
   * Get detail surat tembusan
   */
  .get('/:id', async ({ user, params }) => {
    const roles = await getUserRoles(user.id);
    const activeRole = roles[0] || 'MAHASISWA';

    return tembusanService.getDetail(params.id, user.id, activeRole);
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
    return tembusanService.markAsRead(params.id, user.id);
  }, {
    params: t.Object({
      id: t.String(),
    }),
  });
