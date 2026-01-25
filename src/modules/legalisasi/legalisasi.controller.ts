/**
 * Legalisasi Controller
 * HTTP handlers untuk modul UPA (penomoran, stempel, QR code, finalisasi)
 */

import { Context } from 'elysia';
import { legalisasiService } from './legalisasi.service';

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

    const query = ctx.query as Record<string, string>;
    const params = {
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 10,
      status: query.status as any,
      legalisasiStatus: query.legalisasiStatus as any,
      kategori: query.kategori as any,
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
   * GET /:id - Get letter detail for legalisasi
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
   * GET /check-number - Check if nomor surat is available
   */
  async checkNumber(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const query = ctx.query as { nomorSurat?: string };
    if (!query.nomorSurat) {
      ctx.set.status = 400;
      return { success: false, error: 'Parameter nomorSurat wajib diisi' };
    }

    const result = await legalisasiService.checkNomorSurat(
      query.nomorSurat,
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
   * GET /used-numbers - Get list of used nomor surat
   */
  async getUsedNumbers(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const query = ctx.query as Record<string, string>;
    const params = {
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
      year: query.year ? parseInt(query.year) : undefined,
      search: query.search
    };

    const result = await legalisasiService.getUsedNumbers(params, user.id, user.role);

    if (!result.success) {
      ctx.set.status = result.code || 500;
      return { success: false, error: result.error };
    }

    return result;
  }

  /**
   * POST /:documentId/assign-number - Assign nomor surat to document
   */
  async assignNumber(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { documentId } = ctx.params as { documentId: string };
    const body = ctx.body as { nomorSurat: string; tanggalSurat: string };

    if (!body.nomorSurat || !body.tanggalSurat) {
      ctx.set.status = 400;
      return { success: false, error: 'Field nomorSurat dan tanggalSurat wajib diisi' };
    }

    const result = await legalisasiService.assignNomorSurat(
      {
        documentId,
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
   * POST /:documentId/stamp - Apply stempel to document
   */
  async applyStempel(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { documentId } = ctx.params as { documentId: string };
    const body = ctx.body as { sealImageUrl?: string } | undefined;

    const result = await legalisasiService.applyStempel(
      {
        documentId,
        sealImageUrl: body?.sealImageUrl
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
   * POST /:documentId/generate-qr - Generate QR code for verification
   */
  async generateQRCode(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { documentId } = ctx.params as { documentId: string };
    const result = await legalisasiService.generateQRCode(documentId, user.id, user.role);

    if (!result.success) {
      ctx.set.status = result.code || 500;
      return { success: false, error: result.error };
    }

    return result;
  }

  /**
   * POST /:documentId/finalize - Finalize document (complete legalisasi)
   */
  async finalizeDocument(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { documentId } = ctx.params as { documentId: string };
    const body = ctx.body as { fileUrl: string; notes?: string };

    if (!body.fileUrl) {
      ctx.set.status = 400;
      return { success: false, error: 'Field fileUrl wajib diisi' };
    }

    const result = await legalisasiService.finalizeDocument(
      {
        documentId,
        fileUrl: body.fileUrl,
        notes: body.notes
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
   * GET /:documentId/tembusan - Get tembusan recipients
   */
  async getTembusanRecipients(ctx: ControllerContext) {
    const user = ctx.user;
    if (!user) {
      ctx.set.status = 401;
      return { success: false, error: 'Unauthorized' };
    }

    const { documentId } = ctx.params as { documentId: string };
    const result = await legalisasiService.getTembusanRecipients(
      documentId,
      user.id,
      user.role
    );

    if (!result.success) {
      ctx.set.status = result.code || 500;
      return { success: false, error: result.error };
    }

    return result;
  }
}

export const legalisasiController = new LegalisasiController();
