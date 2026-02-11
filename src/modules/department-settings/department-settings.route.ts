/**
 * Department Settings Route
 * CRUD Departemen & Program Studi untuk Super Admin
 * Prefix: /admin/departments
 */

import { Elysia, t } from 'elysia';
import { authGuardPlugin } from '../../middlewares/auth';
import { prisma } from '../../db';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';
import { getUserRoles } from '../../lib/casbin';

export const departmentSettingsRoutes = new Elysia({ prefix: '/admin' })
  .use(authGuardPlugin)

  // Guard: only SUPERADMIN
  .onBeforeHandle(async ({ user }) => {
    const roles = await getUserRoles(user.id);
    if (!roles.includes('SUPERADMIN')) {
      throw new AppError('Akses ditolak.', HTTP_STATUS.FORBIDDEN);
    }
  })

  // ========== LIST DEPARTMENTS (with nested prodi) ==========
  .get('/departments', async () => {
    try {
      const departments = await prisma.departemen.findMany({
        where: { deletedAt: null },
        include: {
          programStudi: {
            where: { deletedAt: null },
            orderBy: [{ jenjang: 'asc' }, { name: 'asc' }],
          },
          _count: {
            select: {
              mahasiswa: { where: { deletedAt: null } },
              pegawai: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { name: 'asc' },
      });
      return { success: true, message: 'Berhasil', data: departments };
    } catch (error) {
      throw new AppError('Gagal mengambil data departemen', HTTP_STATUS.INTERNAL_ERROR);
    }
  }, {
    detail: { summary: 'List departments', tags: ['Department Settings'] },
  })

  // ========== CREATE DEPARTMENT ==========
  .post('/departments', async ({ body }) => {
    try {
      // Check code uniqueness
      const existing = await prisma.departemen.findUnique({ where: { code: body.code } });
      if (existing) throw new AppError('Kode departemen sudah digunakan', HTTP_STATUS.BAD_REQUEST);

      const dept = await prisma.departemen.create({
        data: { name: body.name, code: body.code },
      });
      return { success: true, message: 'Departemen berhasil dibuat', data: dept };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal membuat departemen',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }, {
    body: t.Object({
      name: t.String({ minLength: 2 }),
      code: t.String({ minLength: 1 }),
    }),
    detail: { summary: 'Create department', tags: ['Department Settings'] },
  })

  // ========== UPDATE DEPARTMENT ==========
  .patch('/departments/:id', async ({ params, body }) => {
    try {
      const dept = await prisma.departemen.findUnique({ where: { id: params.id } });
      if (!dept) throw new AppError('Departemen tidak ditemukan', HTTP_STATUS.NOT_FOUND);

      if (body.code && body.code !== dept.code) {
        const existing = await prisma.departemen.findUnique({ where: { code: body.code } });
        if (existing) throw new AppError('Kode departemen sudah digunakan', HTTP_STATUS.BAD_REQUEST);
      }

      const updated = await prisma.departemen.update({
        where: { id: params.id },
        data: {
          ...(body.name && { name: body.name }),
          ...(body.code && { code: body.code }),
        },
      });
      return { success: true, message: 'Departemen berhasil diperbarui', data: updated };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Gagal memperbarui departemen', HTTP_STATUS.BAD_REQUEST);
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name: t.Optional(t.String({ minLength: 2 })),
      code: t.Optional(t.String({ minLength: 1 })),
    }),
    detail: { summary: 'Update department', tags: ['Department Settings'] },
  })

  // ========== DELETE DEPARTMENT (soft) ==========
  .delete('/departments/:id', async ({ params }) => {
    try {
      const dept = await prisma.departemen.findUnique({
        where: { id: params.id },
        include: {
          _count: {
            select: {
              mahasiswa: { where: { deletedAt: null } },
              pegawai: { where: { deletedAt: null } },
            },
          },
        },
      });
      if (!dept) throw new AppError('Departemen tidak ditemukan', HTTP_STATUS.NOT_FOUND);
      if (dept._count.mahasiswa > 0 || dept._count.pegawai > 0) {
        throw new AppError(
          'Departemen masih memiliki user aktif. Pindahkan atau hapus user terlebih dahulu.',
          HTTP_STATUS.BAD_REQUEST
        );
      }

      await prisma.$transaction([
        prisma.programStudi.updateMany({
          where: { departemenId: params.id, deletedAt: null },
          data: { deletedAt: new Date() },
        }),
        prisma.departemen.update({
          where: { id: params.id },
          data: { deletedAt: new Date() },
        }),
      ]);

      return { success: true, message: 'Departemen berhasil dihapus' };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Gagal menghapus departemen', HTTP_STATUS.BAD_REQUEST);
    }
  }, {
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Delete department', tags: ['Department Settings'] },
  })

  // ========== ADD PRODI TO DEPARTMENT ==========
  .post('/departments/:id/prodi', async ({ params, body }) => {
    try {
      const dept = await prisma.departemen.findUnique({ where: { id: params.id } });
      if (!dept) throw new AppError('Departemen tidak ditemukan', HTTP_STATUS.NOT_FOUND);

      const existing = await prisma.programStudi.findUnique({ where: { code: body.code } });
      if (existing) throw new AppError('Kode program studi sudah digunakan', HTTP_STATUS.BAD_REQUEST);

      const prodi = await prisma.programStudi.create({
        data: {
          name: body.name,
          code: body.code,
          jenjang: body.jenjang,
          hasKaprodi: body.hasKaprodi || false,
          managedByRole: body.hasKaprodi ? 'KAPRODI' : 'KADEP',
          departemenId: params.id,
        },
      });
      return { success: true, message: 'Program Studi berhasil ditambahkan', data: prodi };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        error instanceof Error ? error.message : 'Gagal menambahkan prodi',
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name: t.String({ minLength: 2 }),
      code: t.String({ minLength: 1 }),
      jenjang: t.Union([
        t.Literal('D3'), t.Literal('S1'), t.Literal('S2'),
        t.Literal('S3'), t.Literal('PROFESI'),
      ]),
      hasKaprodi: t.Optional(t.Boolean()),
    }),
    detail: { summary: 'Add prodi to department', tags: ['Department Settings'] },
  })

  // ========== UPDATE PRODI ==========
  .patch('/prodi/:id', async ({ params, body }) => {
    try {
      const prodi = await prisma.programStudi.findUnique({ where: { id: params.id } });
      if (!prodi) throw new AppError('Program Studi tidak ditemukan', HTTP_STATUS.NOT_FOUND);

      if (body.code && body.code !== prodi.code) {
        const existing = await prisma.programStudi.findUnique({ where: { code: body.code } });
        if (existing) throw new AppError('Kode prodi sudah digunakan', HTTP_STATUS.BAD_REQUEST);
      }

      const updateData: any = {};
      if (body.name) updateData.name = body.name;
      if (body.code) updateData.code = body.code;
      if (body.jenjang) updateData.jenjang = body.jenjang;
      if (body.hasKaprodi !== undefined) {
        updateData.hasKaprodi = body.hasKaprodi;
        updateData.managedByRole = body.hasKaprodi ? 'KAPRODI' : 'KADEP';
      }

      const updated = await prisma.programStudi.update({
        where: { id: params.id },
        data: updateData,
      });
      return { success: true, message: 'Program Studi berhasil diperbarui', data: updated };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Gagal memperbarui prodi', HTTP_STATUS.BAD_REQUEST);
    }
  }, {
    params: t.Object({ id: t.String() }),
    body: t.Object({
      name: t.Optional(t.String({ minLength: 2 })),
      code: t.Optional(t.String({ minLength: 1 })),
      jenjang: t.Optional(t.Union([
        t.Literal('D3'), t.Literal('S1'), t.Literal('S2'),
        t.Literal('S3'), t.Literal('PROFESI'),
      ])),
      hasKaprodi: t.Optional(t.Boolean()),
    }),
    detail: { summary: 'Update program studi', tags: ['Department Settings'] },
  })

  // ========== DELETE PRODI (soft) ==========
  .delete('/prodi/:id', async ({ params }) => {
    try {
      const prodi = await prisma.programStudi.findUnique({
        where: { id: params.id },
        include: {
          _count: {
            select: {
              mahasiswa: { where: { deletedAt: null } },
              pegawai: { where: { deletedAt: null } },
            },
          },
        },
      });
      if (!prodi) throw new AppError('Program Studi tidak ditemukan', HTTP_STATUS.NOT_FOUND);
      if (prodi._count.mahasiswa > 0 || prodi._count.pegawai > 0) {
        throw new AppError(
          'Program Studi masih memiliki user aktif. Pindahkan atau hapus user terlebih dahulu.',
          HTTP_STATUS.BAD_REQUEST
        );
      }

      await prisma.programStudi.update({
        where: { id: params.id },
        data: { deletedAt: new Date() },
      });
      return { success: true, message: 'Program Studi berhasil dihapus' };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('Gagal menghapus prodi', HTTP_STATUS.BAD_REQUEST);
    }
  }, {
    params: t.Object({ id: t.String() }),
    detail: { summary: 'Delete program studi', tags: ['Department Settings'] },
  });
