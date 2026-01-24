/**
 * Signing Routes (Elysia)
 * Route definition untuk proses signing dokumen
 * Path prefix: /api/signing
 */

import { Elysia, t } from 'elysia';
import { signingController } from './signing.controller';
import {
  signDocumentSchema,
  generateDraftSchema,
  pendingSignaturesQuerySchema,
  validateSignatureFileForSigning,
} from './signing.validation';
import { authGuardPlugin } from '../../middlewares/auth';
import { getUserRoles } from '../../lib/casbin';
import { errorResponse } from '../../shared/utils/response';
import { HTTP_STATUS } from '../../shared/constants/http-status';
import type { SigningMethod } from './hasil.types';

// ============================================================================
// Signing Roles Guard
// ============================================================================

const ALLOWED_SIGNING_ROLES = [
  'KAPRODI',
  'KADEP',
  'DEKAN',
  'WAKIL_DEKAN_1',
  'WAKIL_DEKAN_2',
] as const;

async function getSigningRole(userId: string): Promise<string | null> {
  const roles = await getUserRoles(userId);
  return roles.find((r) => ALLOWED_SIGNING_ROLES.includes(r as any)) || null;
}

// ============================================================================
// Signing Routes
// ============================================================================

export const signingRoutes = new Elysia({ prefix: '/signing' })
  .use(authGuardPlugin)

  // ==========================================================================
  // Pending Signatures (for signers dashboard)
  // ==========================================================================

  .get(
    '/pending',
    async ({ query, user }) => {
      const signingRole = await getSigningRole(user.id);
      if (!signingRole) {
        return errorResponse(
          'Anda tidak memiliki role untuk menandatangani dokumen',
          HTTP_STATUS.FORBIDDEN
        );
      }
      return signingController.getPendingSignatures(signingRole, {
        page: query.page,
        limit: query.limit,
      });
    },
    {
      query: pendingSignaturesQuerySchema,
      detail: {
        summary: 'Get pending signatures',
        description:
          'Mendapatkan daftar dokumen yang menunggu tanda tangan untuk role user yang login',
        tags: ['Signing'],
      },
    }
  )

  // ==========================================================================
  // Signature Detail
  // ==========================================================================

  .get(
    '/:signatureId',
    async ({ params, user }) => {
      const signingRole = await getSigningRole(user.id);
      if (!signingRole) {
        return errorResponse(
          'Anda tidak memiliki role untuk menandatangani dokumen',
          HTTP_STATUS.FORBIDDEN
        );
      }
      return signingController.getSignatureDetail(params.signatureId, user.id, signingRole);
    },
    {
      params: t.Object({
        signatureId: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: 'Get signature detail',
        description: 'Mendapatkan detail signature untuk proses penandatanganan',
        tags: ['Signing'],
      },
    }
  )

  // ==========================================================================
  // Sign Document
  // ==========================================================================

  .post(
    '/sign',
    async ({ body, user }) => {
      const signingRole = await getSigningRole(user.id);
      if (!signingRole) {
        return errorResponse(
          'Anda tidak memiliki role untuk menandatangani dokumen',
          HTTP_STATUS.FORBIDDEN
        );
      }

      // Validate file if provided
      const fileValidation = validateSignatureFileForSigning(body.signatureFile as File | undefined);
      if (!fileValidation.valid) {
        return errorResponse(fileValidation.error!, HTTP_STATUS.BAD_REQUEST);
      }

      return signingController.signDocument(user.id, signingRole, {
        signatureId: body.signatureId,
        letterInstanceId: body.letterInstanceId,
        method: body.method as SigningMethod,
        savedSignatureId: body.savedSignatureId,
        signatureFile: body.signatureFile as File | undefined,
        saveAsTemplate: body.saveAsTemplate,
        templateAlias: body.templateAlias,
      });
    },
    {
      body: signDocumentSchema,
      type: 'multipart/formdata',
      detail: {
        summary: 'Sign document',
        description:
          'Menandatangani dokumen dengan 3 metode: UPLOAD (upload file), CANVAS (gambar langsung), SAVED (dari template tersimpan)',
        tags: ['Signing'],
      },
    }
  )

  // ==========================================================================
  // Generate Draft (for staff)
  // ==========================================================================

  .post(
    '/generate-draft',
    async ({ body, user }) => {
      // Cast variables properly
      const variables = body.variables as Record<string, string | number | Date>;
      
      return signingController.generateDraft(user.id, {
        letterInstanceId: body.letterInstanceId,
        templateHtml: body.templateHtml,
        variables,
        tembusan: body.tembusan,
      });
    },
    {
      body: generateDraftSchema,
      detail: {
        summary: 'Generate draft HTML',
        description:
          'Generate HTML draft dari template dengan variable replacement dan tembusan',
        tags: ['Signing'],
      },
    }
  );
