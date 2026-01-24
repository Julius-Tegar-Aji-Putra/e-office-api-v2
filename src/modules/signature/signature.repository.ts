/**
 * Signature Repository
 * Data access layer untuk manajemen saved signatures
 */

import { prisma } from '../../db';
import { SignatureType } from '../../generated/prisma/client';

// ============================================================================
// Types
// ============================================================================

export interface CreateSavedSignatureInput {
  userId: string;
  type: SignatureType;
  fileUrl: string;
  fileName: string;
  alias?: string;
}

// ============================================================================
// Repository Class
// ============================================================================

class SignatureRepository {
  /**
   * Get all saved signatures for user
   */
  async getSavedSignaturesByUser(userId: string) {
    return prisma.savedSignature.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get signature by ID
   */
  async getSignatureById(id: string) {
    return prisma.savedSignature.findUnique({
      where: { id },
    });
  }

  /**
   * Get signature by ID with ownership check
   */
  async getSignatureByIdAndUser(id: string, userId: string) {
    return prisma.savedSignature.findFirst({
      where: {
        id,
        userId,
        isActive: true,
      },
    });
  }

  /**
   * Create new saved signature
   */
  async createSavedSignature(input: CreateSavedSignatureInput) {
    return prisma.savedSignature.create({
      data: {
        userId: input.userId,
        type: input.type,
        fileUrl: input.fileUrl,
        fileName: input.fileName,
        alias: input.alias,
        isActive: true,
      },
    });
  }

  /**
   * Update signature alias
   */
  async updateSignatureAlias(id: string, alias: string | null) {
    return prisma.savedSignature.update({
      where: { id },
      data: { alias },
    });
  }

  /**
   * Soft delete signature (set isActive = false)
   */
  async softDeleteSignature(id: string) {
    return prisma.savedSignature.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Hard delete signature
   */
  async deleteSignature(id: string) {
    return prisma.savedSignature.delete({
      where: { id },
    });
  }

  /**
   * Count user's signatures
   */
  async countUserSignatures(userId: string) {
    return prisma.savedSignature.count({
      where: {
        userId,
        isActive: true,
      },
    });
  }
}

export const signatureRepository = new SignatureRepository();
