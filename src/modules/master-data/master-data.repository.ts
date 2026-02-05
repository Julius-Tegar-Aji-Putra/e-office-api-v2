/**
 * Master Data Repository
 * Data access layer for ProgramStudi and Departemen
 */

import { prisma } from '../../db';

export const masterDataRepository = {
  /**
   * Get all program studi with department information
   */
  async getAllProdi() {
    return prisma.programStudi.findMany({
      where: {
        deletedAt: null
      },
      include: {
        departemen: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: [
        { jenjang: 'asc' },
        { name: 'asc' }
      ]
    });
  },

  /**
   * Get all departments with their program studi
   */
  async getAllDepartemen() {
    return prisma.departemen.findMany({
      where: {
        deletedAt: null,
        code: { not: 'FSM' } // Exclude faculty-level department
      },
      include: {
        programStudi: {
          where: {
            deletedAt: null,
            code: { not: 'FAKULTAS' } // Exclude faculty placeholder
          },
          orderBy: [
            { jenjang: 'asc' },
            { name: 'asc' }
          ]
        }
      },
      orderBy: {
        name: 'asc'
      }
    });
  },

  /**
   * Get prodi by ID with department info
   */
  async getProdiById(id: string) {
    return prisma.programStudi.findUnique({
      where: { id },
      include: {
        departemen: true
      }
    });
  },

  /**
   * Get department by ID with prodi list
   */
  async getDepartemenById(id: string) {
    return prisma.departemen.findUnique({
      where: { id },
      include: {
        programStudi: {
          where: {
            deletedAt: null
          }
        }
      }
    });
  }
};
