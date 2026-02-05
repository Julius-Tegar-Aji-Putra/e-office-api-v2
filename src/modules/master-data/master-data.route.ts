/**
 * Master Data Routes
 * Public endpoints for fetching program studi and departemen data
 */

import { Elysia, t } from 'elysia';
import { masterDataService } from './master-data.service';
import { AppError } from '../../shared/utils/errors';
import { HTTP_STATUS } from '../../shared/constants/http';

export const masterDataRoutes = new Elysia({ prefix: '/master-data' })
  /**
   * GET /api/master-data/prodi
   * Get all program studi with department info
   */
  .get('/prodi', async () => {
    try {
      const prodiList = await masterDataService.getProdiList();
      return {
        success: true,
        data: prodiList,
        message: 'Program studi list retrieved successfully'
      };
    } catch (error) {
      console.error('Error fetching prodi list:', error);
      throw new AppError('Failed to fetch program studi list', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  })

  /**
   * GET /api/master-data/prodi/:id
   * Get single prodi details
   */
  .get('/prodi/:id', async ({ params }) => {
    try {
      const prodi = await masterDataService.getProdiDetail(params.id);
      if (!prodi) {
        throw new AppError('Program studi not found', HTTP_STATUS.NOT_FOUND);
      }
      return {
        success: true,
        data: prodi,
        message: 'Program studi details retrieved successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Error fetching prodi details:', error);
      throw new AppError('Failed to fetch program studi details', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  })

  /**
   * GET /api/master-data/departemen
   * Get all departments with their prodi
   */
  .get('/departemen', async () => {
    try {
      const deptList = await masterDataService.getDepartemenList();
      return {
        success: true,
        data: deptList,
        message: 'Departemen list retrieved successfully'
      };
    } catch (error) {
      console.error('Error fetching departemen list:', error);
      throw new AppError('Failed to fetch departemen list', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  })

  /**
   * GET /api/master-data/departemen/:id
   * Get single department details
   */
  .get('/departemen/:id', async ({ params }) => {
    try {
      const dept = await masterDataService.getDepartemenDetail(params.id);
      if (!dept) {
        throw new AppError('Departemen not found', HTTP_STATUS.NOT_FOUND);
      }
      return {
        success: true,
        data: dept,
        message: 'Departemen details retrieved successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Error fetching departemen details:', error);
      throw new AppError('Failed to fetch departemen details', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }, {
    params: t.Object({
      id: t.String()
    })
  });

export default masterDataRoutes;
