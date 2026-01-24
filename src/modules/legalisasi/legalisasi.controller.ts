/**
 * Legalisasi Controller
 * HTTP handlers untuk modul UPA (penomoran, stempel, finalisasi)
 */

import { Context } from 'elysia';
import { legalisasiService } from './legalisasi.service';
import { DocumentType } from '../../generated/prisma/client';

// ============================================================================
// TYPES
// ============================================================================

interface UserContext {
  user?: {
    id: string;
    role: string;
    name: string;
  };
}

type ControllerContext = Context & UserContext;

// ============================================================================
// CONTROLLER CLASS
// ============================================================================

class LegalisasiController {
  /**
   * GET /queue - Get UPA processing queue
   */
  async getQueue(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const query = ctx.query as any;
    const params = {
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 10,
      status: query.status,
      search: query.search
    };

    const result = await legalisasiService.getUPAQueue(params, user.id, user.role);

    if (!result.success) {
      ctx.set.status = result.code || 500;
      return { success: false, error: result.error };
    }

    return result;
  }

  /**
   * GET /:id - Get letter detail
   */
  async getLetterDetail(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { id } = ctx.params as { id: string };
    const result = await legalisasiService.getLetterDetail(id, user.id, user.role);

    if (!result.success) {
      ctx.set.status = result.code || 500;
      return { success: false, error: result.error };
    }

    return result;
  }

  /**
   * GET /recent-numbers/:type - Get recent nomor surat for reference
   */
  async getRecentNumbers(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { type } = ctx.params as { type: string };
    
    // Validate document type
    if (!Object.values(DocumentType).includes(type as DocumentType)) {
      ctx.set.status = 400;
      return { success: false, error: 'Invalid document type' };
    }

    const result = await legalisasiService.getRecentNomorSurat(
      type as DocumentType,
      user.id,
      user.role
    );

    if (!result.success) {
      ctx.set.status = result.code || 500;
      return { success: false, error: result.error };
    }

    return result;
  }

  /**
   * POST /:id/assign-number - Assign nomor surat
   */
  async assignNumber(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { id } = ctx.params as { id: string };
    const body = ctx.body as { nomorSurat: string; tanggalSurat: string };

    if (!body.nomorSurat || !body.tanggalSurat) {
      ctx.set.status = 400;
      return { success: false, error: 'Missing required fields: nomorSurat, tanggalSurat' };
    }

    const result = await legalisasiService.assignNomorSurat(
      {
        documentId: id,
        nomorSurat: body.nomorSurat,
        tanggalSurat: new Date(body.tanggalSurat)
      },
      user.id,
      user.role
    );

    if (!result.success) {
      ctx.set.status = result.code || 500;
      return { success: false, error: result.error };
    }

    return result;
  }

  /**
   * POST /:id/stamp - Apply stamp to document
   */
  async applyStamp(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { id } = ctx.params as { id: string };
    const result = await legalisasiService.applyStamp(id, user.id, user.role);

    if (!result.success) {
      ctx.set.status = result.code || 500;
      return { success: false, error: result.error };
    }

    return result;
  }

  /**
   * POST /:id/finalize - Finalize document (QR, PDF)
   */
  async finalizeDocument(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { id } = ctx.params as { id: string };
    const body = ctx.body as { qrCodeUrl: string; fileUrl: string };

    if (!body.qrCodeUrl || !body.fileUrl) {
      ctx.set.status = 400;
      return { success: false, error: 'Missing required fields: qrCodeUrl, fileUrl' };
    }

    const result = await legalisasiService.finalizeDocument(
      {
        documentId: id,
        qrCodeUrl: body.qrCodeUrl,
        fileUrl: body.fileUrl
      },
      user.id,
      user.role
    );

    if (!result.success) {
      ctx.set.status = result.code || 500;
      return { success: false, error: result.error };
    }

    return result;
  }

  /**
   * GET /:id/tembusan - Get tembusan recipients
   */
  async getTembusanRecipients(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { id } = ctx.params as { id: string };
    const result = await legalisasiService.getTembusanRecipients(id, user.id, user.role);

    if (!result.success) {
      ctx.set.status = result.code || 500;
      return { success: false, error: result.error };
    }

    return result;
  }
}

export const legalisasiController = new LegalisasiController();
