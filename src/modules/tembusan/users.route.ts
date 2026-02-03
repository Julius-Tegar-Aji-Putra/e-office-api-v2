/**
 * Users API Route
 * Endpoint untuk mendapatkan daftar user untuk tembusan selection
 * Path: /api/users
 */

import { Elysia, t } from 'elysia';
import { authGuardPlugin } from '../../middlewares/auth';
import { prisma } from '../../db';
import { ROLES, STAF_ROLES, SUPERVISOR_ROLES } from '../../shared/constants/roles';
import { getUserRoles } from '../../lib/casbin';
import type { TembusanUser, TembusanUserListResponse } from '../tembusan/tembusan.types';

// ============================================================================
// PUBLIC ROUTE - Pejabat list (no auth required)
// ============================================================================

const publicUsersRoute = new Elysia({ prefix: '/api/users' })
  /**
   * GET /api/users/pejabat
   * Get list of pejabat (officials) with their roles, names, and NIPs
   * Used for signature configuration in draft forms
   * PUBLIC - no auth required for autofill functionality
   */
  .get('/pejabat', async () => {
    try {
      console.log('📡 [/api/users/pejabat] Request received');
      
      // Get pejabat data directly from user + pegawai tables based on roles
      // Roles that can sign documents: DEKAN, WADEK_1, WADEK_2, KAPRODI, KADEP
      const pejabatRoles = [ROLES.DEKAN, ROLES.WADEK_1, ROLES.WADEK_2, ROLES.KAPRODI, ROLES.KADEP];
      
      const users = await prisma.user.findMany({
        where: {
          userRoles: {
            some: {
              role: {
                name: {
                  in: pejabatRoles
                }
              }
            }
          }
        },
        include: {
          userRoles: {
            include: {
              role: true
            }
          },
          pegawai: {
            select: {
              nip: true
            }
          }
        }
      });

      console.log(`Found ${users.length} pejabat users`);

      // Get all pegawai for NIP lookup by name (for users with multiple roles sharing same NIP)
      const allPegawai = await prisma.pegawai.findMany({
        select: {
          nip: true,
          user: {
            select: {
              name: true
            }
          }
        }
      });

      // Create name to NIP mapping
      const nameToNipMap = new Map<string, string>();
      allPegawai.forEach(p => {
        if (p.user?.name) {
          nameToNipMap.set(p.user.name, p.nip);
        }
      });

      // Map to expected format
      const pejabatList = users.flatMap(user => {
        // A user can have multiple roles, map each pejabat role
        return user.userRoles
          .filter(ur => pejabatRoles.includes(ur.role.name))
          .map(ur => ({
            role: ur.role.name,
            name: user.name,
            // Try to get NIP from direct pegawai relation, fallback to name lookup
            nip: user.pegawai?.nip || nameToNipMap.get(user.name)
          }));
      });

      console.log('📦 Final pejabat list:', pejabatList);

      return {
        success: true,
        data: pejabatList
      };
    } catch (error) {
      console.error('❌ Error fetching pejabat list:', error);
      return {
        success: false,
        error: 'Gagal memuat daftar pejabat',
        data: []
      };
    }
  });

// ============================================================================
// PROTECTED ROUTES - Require authentication
// ============================================================================

const protectedUsersRoute = new Elysia({ prefix: '/api/users' })
  .use(authGuardPlugin)

  /**
   * GET /api/users/tembusan-list
   * Get list of users for tembusan selection dropdown
   * Only accessible by STAF_AKADEMIK and STAF_SUMBER_DAYA
   */
  .get('/tembusan-list', async ({ user, query }): Promise<TembusanUserListResponse> => {
    try {
      // Check if user is staff, supervisor, or manajer TU
      const roles = await getUserRoles(user.id);
      const isStaff = roles.some(r => (STAF_ROLES as readonly string[]).includes(r));
      const isSupervisor = roles.some(r => (SUPERVISOR_ROLES as readonly string[]).includes(r));
      const isManajerTU = roles.includes(ROLES.MANAJER_TU);
      
      if (!isStaff && !isSupervisor && !isManajerTU) {
        return {
          success: false,
          error: 'Anda tidak memiliki akses ke daftar pengguna untuk tembusan'
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
      // Allow staff, supervisor, and manajer TU to search users
      const roles = await getUserRoles(user.id);
      const isStaff = roles.some(r => (STAF_ROLES as readonly string[]).includes(r));
      const isSupervisor = roles.some(r => (SUPERVISOR_ROLES as readonly string[]).includes(r));
      const isManajerTU = roles.includes(ROLES.MANAJER_TU);
      
      if (!isStaff && !isSupervisor && !isManajerTU) {
        return {
          success: false,
          error: 'Anda tidak memiliki akses ke fitur pencarian pengguna'
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
  });

// ============================================================================
// COMBINED EXPORT
// ============================================================================

export const usersRoute = new Elysia()
  .use(publicUsersRoute)
  .use(protectedUsersRoute);
