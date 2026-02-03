/**
 * Users API Route
 * Endpoint untuk mendapatkan daftar user untuk tembusan selection
 * Path: /api/users
 */

import { Elysia, t } from 'elysia';
import { authGuardPlugin } from '../../middlewares/auth';
import { prisma } from '../../db';
import { ROLES, STAF_ROLES } from '../../shared/constants/roles';
import { getUserRoles } from '../../lib/casbin';
import type { TembusanUser, TembusanUserListResponse } from '../tembusan/tembusan.types';

// ============================================================================
// USERS ROUTES FOR TEMBUSAN SELECTION
// ============================================================================

export const usersRoute = new Elysia({ prefix: '/api/users' })
  .use(authGuardPlugin)

  /**
   * GET /api/users/tembusan-list
   * Get list of users for tembusan selection dropdown
   * Only accessible by STAF_AKADEMIK and STAF_SUMBER_DAYA
   */
  .get('/tembusan-list', async ({ user, query }): Promise<TembusanUserListResponse> => {
    try {
      // Check if user is staff
      const roles = await getUserRoles(user.id);
      const isStaff = roles.some(r => (STAF_ROLES as readonly string[]).includes(r));
      
      if (!isStaff) {
        return {
          success: false,
          error: 'Hanya staf yang dapat mengakses daftar pengguna untuk tembusan'
        };
      }

      const page = query.page ? parseInt(query.page) : 1;
      const limit = query.limit ? parseInt(query.limit) : 50;
      const search = query.search || '';
      const type = query.type as 'all' | 'mahasiswa' | 'pegawai' | undefined;
      const skip = (page - 1) * limit;

      // Build search condition
      const searchCondition = search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } }
        ]
      } : {};

      // Fetch users based on type filter
      let users: TembusanUser[] = [];
      let totalMahasiswa = 0;
      let totalPegawai = 0;

      if (type === 'all' || type === 'mahasiswa' || !type) {
        // Get mahasiswa
        const mahasiswaWhere = {
          deletedAt: null,
          user: {
            deletedAt: null,
            ...searchCondition
          }
        };

        const [mahasiswaData, mahasiswaCount] = await Promise.all([
          prisma.mahasiswa.findMany({
            where: mahasiswaWhere,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              programStudi: {
                select: { name: true }
              },
              departemen: {
                select: { name: true }
              }
            },
            skip: type === 'mahasiswa' ? skip : 0,
            take: type === 'mahasiswa' ? limit : (type === 'all' || !type ? Math.ceil(limit / 2) : 0),
            orderBy: { user: { name: 'asc' } }
          }),
          prisma.mahasiswa.count({ where: mahasiswaWhere })
        ]);

        totalMahasiswa = mahasiswaCount;

        users.push(...mahasiswaData.map(m => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          type: 'mahasiswa' as const,
          identifier: m.nim,
          department: m.departemen?.name,
          programStudi: m.programStudi?.name
        })));
      }

      if (type === 'all' || type === 'pegawai' || !type) {
        // Get pegawai
        const pegawaiWhere = {
          deletedAt: null,
          user: {
            deletedAt: null,
            ...searchCondition
          }
        };

        const [pegawaiData, pegawaiCount] = await Promise.all([
          prisma.pegawai.findMany({
            where: pegawaiWhere,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              programStudi: {
                select: { name: true }
              },
              departemen: {
                select: { name: true }
              }
            },
            skip: type === 'pegawai' ? skip : 0,
            take: type === 'pegawai' ? limit : (type === 'all' || !type ? Math.ceil(limit / 2) : 0),
            orderBy: { user: { name: 'asc' } }
          }),
          prisma.pegawai.count({ where: pegawaiWhere })
        ]);

        totalPegawai = pegawaiCount;

        users.push(...pegawaiData.map(p => ({
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          type: 'pegawai' as const,
          identifier: p.nip,
          department: p.departemen?.name,
          programStudi: p.programStudi?.name,
          jabatan: p.jabatan
        })));
      }

      // Sort combined results by name
      users.sort((a, b) => a.name.localeCompare(b.name));

      const total = type === 'mahasiswa' ? totalMahasiswa : 
                   type === 'pegawai' ? totalPegawai : 
                   totalMahasiswa + totalPegawai;

      return {
        success: true,
        data: {
          users,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching tembusan user list:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Gagal memuat daftar pengguna'
      };
    }
  }, {
    query: t.Object({
      page: t.Optional(t.String()),
      limit: t.Optional(t.String()),
      search: t.Optional(t.String()),
      type: t.Optional(t.Union([
        t.Literal('all'),
        t.Literal('mahasiswa'),
        t.Literal('pegawai')
      ]))
    })
  })

  /**
   * GET /api/users/search
   * Quick search users by name for autocomplete
   */
  .get('/search', async ({ user, query }) => {
    try {
      const roles = await getUserRoles(user.id);
      const isStaff = roles.some(r => (STAF_ROLES as readonly string[]).includes(r));
      
      if (!isStaff) {
        return {
          success: false,
          error: 'Hanya staf yang dapat mengakses fitur ini'
        };
      }

      const search = query.q || '';
      if (search.length < 2) {
        return {
          success: true,
          data: []
        };
      }

      // Search both mahasiswa and pegawai
      const [mahasiswaResults, pegawaiResults] = await Promise.all([
        prisma.mahasiswa.findMany({
          where: {
            deletedAt: null,
            user: {
              deletedAt: null,
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
              ]
            }
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            programStudi: { select: { name: true } }
          },
          take: 10
        }),
        prisma.pegawai.findMany({
          where: {
            deletedAt: null,
            OR: [
              {
                user: {
                  deletedAt: null,
                  OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } }
                  ]
                }
              },
              {
                jabatan: { contains: search, mode: 'insensitive' }
              }
            ]
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            programStudi: { select: { name: true } }
          },
          take: 10
        })
      ]);

      const results: TembusanUser[] = [
        ...mahasiswaResults.map(m => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          type: 'mahasiswa' as const,
          identifier: m.nim,
          programStudi: m.programStudi?.name
        })),
        ...pegawaiResults.map(p => ({
          id: p.user.id,
          name: p.user.name,
          email: p.user.email,
          type: 'pegawai' as const,
          identifier: p.nip,
          jabatan: p.jabatan,
          programStudi: p.programStudi?.name
        }))
      ];

      // Sort by relevance (exact match first, then alphabetically)
      results.sort((a, b) => {
        const aExact = a.name.toLowerCase().startsWith(search.toLowerCase());
        const bExact = b.name.toLowerCase().startsWith(search.toLowerCase());
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        return a.name.localeCompare(b.name);
      });

      return {
        success: true,
        data: results.slice(0, 15)
      };
    } catch (error) {
      console.error('Error searching users:', error);
      return {
        success: false,
        error: 'Gagal mencari pengguna'
      };
    }
  }, {
    query: t.Object({
      q: t.Optional(t.String())
    })
  })

  /**
   * GET /api/users/pejabat
   * Get list of pejabat (officials) with their roles, names, and NIPs
   * Used for signature configuration in draft forms
   */
  .get('/pejabat', async () => {
    try {
      // Define pejabat roles we need to fetch
      const pejabatRoles = [
        { role: ROLES.DEKAN, label: 'Dekan' },
        { role: ROLES.WADEK_1, label: 'Wakil Dekan I' },
        { role: ROLES.WADEK_2, label: 'Wakil Dekan II' },
        { role: ROLES.KAPRODI, label: 'Ketua Prodi' },
        { role: ROLES.KADEP, label: 'Ketua Departemen' }
      ];

      const pejabatList = await Promise.all(
        pejabatRoles.map(async ({ role, label }) => {
          // Get user with this role from casbin
          const usersWithRole = await prisma.$queryRaw<Array<{ subject: string }>>`
            SELECT DISTINCT v0 as subject
            FROM casbin_rule
            WHERE ptype = 'g'
              AND v1 = ${role}
          `;

          if (usersWithRole.length === 0) {
            return { role, name: label, nip: undefined };
          }

          // Get user details (prioritize pegawai, fallback to user table)
          const userId = usersWithRole[0].subject;
          
          const pegawai = await prisma.pegawai.findFirst({
            where: {
              userId,
              deletedAt: null
            },
            include: {
              user: {
                select: { name: true }
              }
            }
          });

          if (pegawai) {
            return {
              role,
              name: pegawai.user.name,
              nip: pegawai.nip
            };
          }

          // Fallback to user table if not pegawai
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true }
          });

          return {
            role,
            name: user?.name || label,
            nip: undefined
          };
        })
      );

      return {
        success: true,
        data: pejabatList
      };
    } catch (error) {
      console.error('Error fetching pejabat list:', error);
      return {
        success: false,
        error: 'Gagal memuat daftar pejabat',
        data: []
      };
    }
  });
