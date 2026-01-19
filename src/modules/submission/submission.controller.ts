/**
 * Submission Controller
 * HTTP controller untuk handle request & response pengajuan surat
 */

import { Context } from 'hono';
import { SubmissionService } from './submission.service';
import { successResponse } from '../../shared/utils/response.util';
import { getPaginationParams } from '../../shared/utils/pagination.util';

export class SubmissionController {
  constructor(private submissionService: SubmissionService) {}

  // GET /submission - List semua pengajuan
  async list(c: Context) {
    const user = c.get('user');
    const { page, limit } = getPaginationParams(
      c.req.query('page'),
      c.req.query('limit')
    );
    
    const result = await this.submissionService.getSubmissions(user.userId, { page, limit });
    return c.json(successResponse('Berhasil mengambil data pengajuan', result.data, result.meta));
  }

  // GET /submission/:id - Detail pengajuan
  async getById(c: Context) {
    const id = c.req.param('id');
    const data = await this.submissionService.getSubmissionById(id);
    return c.json(successResponse('Berhasil mengambil detail pengajuan', data));
  }

  // POST /submission - Buat pengajuan baru
  async create(c: Context) {
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.submissionService.createSubmission(user.userId, body);
    return c.json(successResponse('Berhasil membuat pengajuan', data), 201);
  }

  // PUT /submission/:id - Update pengajuan
  async update(c: Context) {
    const id = c.req.param('id');
    const body = await c.req.json();
    const data = await this.submissionService.updateSubmission(id, body);
    return c.json(successResponse('Berhasil update pengajuan', data));
  }

  // POST /submission/:id/submit - Submit pengajuan
  async submit(c: Context) {
    const id = c.req.param('id');
    const data = await this.submissionService.submitSubmission(id);
    return c.json(successResponse('Pengajuan berhasil disubmit', data));
  }

  // DELETE /submission/:id - Hapus pengajuan
  async delete(c: Context) {
    const id = c.req.param('id');
    await this.submissionService.deleteSubmission(id);
    return c.json(successResponse('Pengajuan berhasil dihapus'));
  }
}
