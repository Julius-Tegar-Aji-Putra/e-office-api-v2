/**
 * Pengantar Controller
 * Controller untuk surat pengantar Prodi-Departemen
 */

import { Context } from 'hono';
import { PengantarService } from './pengantar.service';
import { successResponse } from '../../shared/utils/response.util';

export class PengantarController {
  constructor(private pengantarService: PengantarService) {}

  // GET /pengantar - List surat pengantar
  async list(c: Context) {
    const user = c.get('user');
    const data = await this.pengantarService.getSuratPengantar(user);
    return c.json(successResponse('Berhasil mengambil data surat pengantar', data));
  }

  // GET /pengantar/:id - Detail surat pengantar
  async getById(c: Context) {
    const id = c.req.param('id');
    const data = await this.pengantarService.getSuratPengantarById(id);
    return c.json(successResponse('Berhasil mengambil detail surat pengantar', data));
  }

  // POST /pengantar/:submissionId/generate - Generate surat pengantar dari prodi
  async generateFromProdi(c: Context) {
    const submissionId = c.req.param('submissionId');
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.pengantarService.generatePengantarProdi(submissionId, user.userId, body);
    return c.json(successResponse('Surat pengantar berhasil digenerate', data), 201);
  }

  // POST /pengantar/:id/approve - Approve surat pengantar (Kaprodi/Kadep)
  async approve(c: Context) {
    const id = c.req.param('id');
    const user = c.get('user');
    const data = await this.pengantarService.approvePengantar(id, user.userId);
    return c.json(successResponse('Surat pengantar berhasil disetujui', data));
  }

  // POST /pengantar/:id/reject - Reject surat pengantar
  async reject(c: Context) {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.pengantarService.rejectPengantar(id, user.userId, body.reason);
    return c.json(successResponse('Surat pengantar ditolak', data));
  }
}
