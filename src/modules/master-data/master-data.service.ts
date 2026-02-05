/**
 * Master Data Service
 * Business logic for master data operations
 */

import { masterDataRepository } from './master-data.repository';

export const masterDataService = {
  /**
   * Get all program studi list
   */
  async getProdiList() {
    return masterDataRepository.getAllProdi();
  },

  /**
   * Get all departments with prodi
   */
  async getDepartemenList() {
    return masterDataRepository.getAllDepartemen();
  },

  /**
   * Get single prodi details
   */
  async getProdiDetail(id: string) {
    return masterDataRepository.getProdiById(id);
  },

  /**
   * Get single department details
   */
  async getDepartemenDetail(id: string) {
    return masterDataRepository.getDepartemenById(id);
  }
};
