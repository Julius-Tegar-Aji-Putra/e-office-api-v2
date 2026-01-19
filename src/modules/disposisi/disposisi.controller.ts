/**
 * Disposisi Controller
 * Controller untuk disposisi surat
 */

import { Context } from 'hono';
import { DisposisiService } from './disposisi.service';
import { successResponse } from '../../shared/utils/response.util';

export class DisposisiController {
  constructor(private disposisiService: DisposisiService) {}

  async list(c: Context) {
    const user = c.get('user');
    const data = await this.disposisiService.getDisposisiList(user);
    return c.json(successResponse('Berhasil mengambil data disposisi', data));
  }

  async getById(c: Context) {
    const id = c.req.param('id');
    const data = await this.disposisiService.getDisposisiById(id);
    return c.json(successResponse('Berhasil mengambil detail disposisi', data));
  }

  async create(c: Context) {
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.disposisiService.createDisposisi(user.userId, body);
    return c.json(successResponse('Disposisi berhasil dibuat', data), 201);
  }

  async process(c: Context) {
    const id = c.req.param('id');
    const user = c.get('user');
    const body = await c.req.json();
    const data = await this.disposisiService.processDisposisi(id, user.userId, body);
    return c.json(successResponse('Disposisi berhasil diproses', data));
  }
}
