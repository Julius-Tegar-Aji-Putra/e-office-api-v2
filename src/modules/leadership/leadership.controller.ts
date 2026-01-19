/**
 * Leadership Controller
 * Controller aksi pimpinan (Dekan/Wadek)
 */

import { Context } from 'hono';
import { LeadershipService } from './leadership.service';
import { successResponse } from '../../shared/utils/response.util';

export class LeadershipController {
  constructor(private leadershipService: LeadershipService) {}

  async listPending(c: Context) {
    const user = c.get('user');
    const data = await this.leadershipService.getPendingApprovals(user);
    return c.json(successResponse('Berhasil mengambil data pending approval', data));
  }

  async approve(c: Context) {
    const submissionId = c.req.param('submissionId');
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.leadershipService.approveSubmission(submissionId, user.userId, body);
    return c.json(successResponse('Pengajuan berhasil disetujui', data));
  }

  async reject(c: Context) {
    const submissionId = c.req.param('submissionId');
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.leadershipService.rejectSubmission(submissionId, user.userId, body.reason);
    return c.json(successResponse('Pengajuan ditolak', data));
  }

  async redispose(c: Context) {
    const submissionId = c.req.param('submissionId');
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.leadershipService.redisposeSubmission(submissionId, user.userId, body);
    return c.json(successResponse('Pengajuan berhasil didisposisi ulang', data));
  }
}
