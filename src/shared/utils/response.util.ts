/**
 * Response Utility
 * Standard API response formatter untuk Elysia
 */

import type { Context } from 'elysia';

// ============================================================================
// TYPES
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: { field?: string; message: string }[];
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================================
// HTTP STATUS CODES
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// ============================================================================
// RESPONSE HELPERS (For Elysia Context)
// ============================================================================

/**
 * Success response with Elysia context
 */
export function successResponse<T = any>(
  context: Context | any,
  message: string,
  data?: T,
  meta?: PaginationMeta
): ApiResponse<T> {
  if (context?.set) {
    context.set.status = HTTP_STATUS.OK;
  }
  return {
    success: true,
    message,
    ...(data !== undefined && { data }),
    ...(meta && { meta }),
  };
}

/**
 * Error response with Elysia context
 */
export function errorResponse(
  context: Context | any,
  status: number,
  message: string,
  errors?: { field?: string; message: string }[]
): ApiResponse {
  if (context?.set) {
    context.set.status = status;
  }
  return {
    success: false,
    message,
    ...(errors && { errors }),
  };
}

/**
 * Paginated response
 */
export function paginatedResponse<T = any>(
  context: Context | any,
  message: string,
  data: T[],
  pagination: PaginationMeta
): ApiResponse<T[]> {
  if (context?.set) {
    context.set.status = HTTP_STATUS.OK;
  }
  return {
    success: true,
    message,
    data,
    meta: pagination,
  };
}

/**
 * Created response (201)
 */
export function createdResponse<T = any>(
  context: Context | any,
  message: string,
  data?: T
): ApiResponse<T> {
  if (context?.set) {
    context.set.status = HTTP_STATUS.CREATED;
  }
  return {
    success: true,
    message,
    ...(data !== undefined && { data }),
  };
}

/**
 * No content response (204)
 */
export function noContentResponse(context: Context | any): void {
  if (context?.set) {
    context.set.status = HTTP_STATUS.NO_CONTENT;
  }
}

// ============================================================================
// SIMPLE RESPONSE BUILDERS (Without Context)
// ============================================================================

export const buildSuccessResponse = <T = any>(
  message: string,
  data?: T,
  meta?: PaginationMeta
): ApiResponse<T> => ({
  success: true,
  message,
  ...(data !== undefined && { data }),
  ...(meta && { meta }),
});

export const buildErrorResponse = (
  message: string,
  errors?: { field?: string; message: string }[]
): ApiResponse => ({
  success: false,
  message,
  ...(errors && { errors }),
});
