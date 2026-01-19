/**
 * Legalisasi Controller
 * Controller UPA (finalisasi surat)
 */

import { Context } from 'hono';
import { LegalisasiService } from './legalisasi.service';
import { successResponse } from '../../shared/utils/response.util';

export class LegalisasiController {
  constructor(private legalisasiService: LegalisasiService) {}

  async listPending(c: Context) {
    const data = await this.legalisasiService.getPendingLegalisasi();
    return c.json(successResponse('Berhasil mengambil data pending legalisasi', data));
  }

  async getById(c: Context) {
    const id = c.req.param('id');
    const data = await this.legalisasiService.getLegalisasiById(id);
    return c.json(successResponse('Berhasil mengambil detail legalisasi', data));
  }

  async process(c: Context) {
    const suratHasilId = c.req.param('suratHasilId');
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.legalisasiService.processLegalisasi(suratHasilId, user.userId, body);
    return c.json(successResponse('Legalisasi berhasil diproses', data));
  }

  async distribute(c: Context) {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.legalisasiService.distributeSurat(id, user.userId, body);
    return c.json(successResponse('Surat berhasil didistribusikan', data));
  }

  async archive(c: Context) {
    const id = c.req.param('id');
    const data = await this.legalisasiService.getArchivedDocuments();
    return c.json(successResponse('Berhasil mengambil arsip dokumen', data));
  }
}
