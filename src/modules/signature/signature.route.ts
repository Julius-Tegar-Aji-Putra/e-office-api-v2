/**
 * Signature Routes
 * Route definitions untuk manajemen saved signatures
 */

import { Elysia, t } from 'elysia';
import { signatureController } from './signature.controller';
import { uploadSignatureSchema, updateSignatureSchema } from './signature.validation';
import { authGuardPlugin } from '../../middlewares/auth';
import type { SignatureUploadMethod } from './signature.types';

// ============================================================================
// Route Definition
// ============================================================================

export const signatureRoutes = new Elysia({ prefix: '/signatures' })
  .use(authGuardPlugin)

  // GET /signatures/me - Get all saved signatures for current user
  .get(
    '/me',
    async ({ user }) => {
      return signatureController.getMySignatures(user.id);
    },
    {
      detail: {
        summary: 'Get My Signatures',
        description: 'Mengambil daftar tanda tangan tersimpan milik user yang login',
        tags: ['Signature'],
      },
    }
  )

  // GET /signatures/:id - Get signature detail by ID
  .get(
    '/:id',
    async ({ params, user }) => {
      return signatureController.getSignatureById(params.id, user.id);
    },
    {
      params: t.Object({
        id: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: 'Get Signature by ID',
        description: 'Mengambil detail tanda tangan berdasarkan ID (hanya milik sendiri)',
        tags: ['Signature'],
      },
    }
  )

  // POST /signatures/upload - Upload new signature
  .post(
    '/upload',
    async ({ body, user }) => {
      const { file, method, alias } = body as {
        file: File;
        method: SignatureUploadMethod;
        alias?: string;
      };
      return signatureController.uploadSignature(user.id, file, method, alias);
    },
    {
      body: uploadSignatureSchema,
      type: 'multipart/formdata',
      detail: {
        summary: 'Upload Signature',
        description:
          'Mengunggah tanda tangan baru (dari file atau canvas drawing). Max 10 tanda tangan per user.',
        tags: ['Signature'],
      },
    }
  )

  // PATCH /signatures/:id - Update signature alias
  .patch(
    '/:id',
    async ({ params, body, user }) => {
      return signatureController.updateSignatureAlias(params.id, user.id, body.alias);
    },
    {
      params: t.Object({
        id: t.String({ minLength: 1 }),
      }),
      body: updateSignatureSchema,
      detail: {
        summary: 'Update Signature Alias',
        description: 'Memperbarui alias/nama tanda tangan',
        tags: ['Signature'],
      },
    }
  )

  // DELETE /signatures/:id - Delete signature
  .delete(
    '/:id',
    async ({ params, user }) => {
      return signatureController.deleteSignature(params.id, user.id);
    },
    {
      params: t.Object({
        id: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: 'Delete Signature',
        description: 'Menghapus tanda tangan tersimpan (hanya milik sendiri)',
        tags: ['Signature'],
      },
    }
  );
