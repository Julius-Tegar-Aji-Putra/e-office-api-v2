/**
 * Hasil Controller
 * Controller untuk surat hasil & tanda tangan
 */

import { Context } from 'hono';
import { HasilService } from './hasil.service';
import { successResponse } from '../../shared/utils/response.util';

export class HasilController {
  constructor(private hasilService: HasilService) {}

  async list(c: Context) {
    const user = c.get('user');
    const data = await this.hasilService.getSuratHasilList(user);
    return c.json(successResponse('Berhasil mengambil data surat hasil', data));
  }

  async getById(c: Context) {
    const id = c.req.param('id');
    const data = await this.hasilService.getSuratHasilById(id);
    return c.json(successResponse('Berhasil mengambil detail surat hasil', data));
  }

  async generate(c: Context) {
    const submissionId = c.req.param('submissionId');
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.hasilService.generateSuratHasil(submissionId, user.userId, body);
    return c.json(successResponse('Surat hasil berhasil digenerate', data), 201);
  }

  async sign(c: Context) {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.hasilService.signDocument(id, user.userId, body);
    return c.json(successResponse('Dokumen berhasil ditandatangani', data));
  }

  async getSignatureQueue(c: Context) {
    const id = c.req.param('id');
    const data = await this.hasilService.getSignatureQueue(id);
    return c.json(successResponse('Berhasil mengambil antrian tanda tangan', data));
  }
}
