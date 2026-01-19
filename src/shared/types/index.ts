/**
 * Global Shared Types
 * Global shared TypeScript types & interfaces
 */

export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserContext {
  userId: string;
  email: string;
  role: string;
}

export interface QueryParams {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FileUpload {
  filename: string;
  mimetype: string;
  size: number;
  url: string;
}
