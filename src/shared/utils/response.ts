/**
 * Standardized API Response Formatter
 * Konsisten dengan Elysia response pattern
 */

import { HTTP_STATUS } from '../constants/http-status';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
  errors?: Array<{
    field?: string;
    message: string;
  }>;
}

/**
 * Success Response
 * @param message - Response message
 * @param data - Response data (optional)
 * @param meta - Pagination meta (optional)
 */
export function successResponse<T>(
  message: string,
  data?: T,
  meta?: ApiResponse['meta']
): ApiResponse<T> {
  return {
    success: true,
    message,
    ...(data !== undefined && { data }),
    ...(meta && { meta }),
  };
}

/**
 * Error Response
 * @param message - Error message
 * @param status - HTTP status code (for reference, not used in response body)
 */
export function errorResponse(
  message: string,
  status?: number
): ApiResponse<null> {
  return {
    success: false,
    message,
    data: null,
  };
}

/**
 * Pagination Response
 * @param message - Response message
 * @param data - Array of items
 * @param pagination - Pagination info {page, limit, total}
 */
export function paginatedResponse<T>(
  message: string,
  data: T[],
  pagination: { page: number; limit: number; total: number }
): ApiResponse<T[]> {
  return {
    success: true,
    message,
    data,
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  };
}

/**
 * Created Response (201)
 */
export function createdResponse<T>(
  message: string,
  data?: T
): ApiResponse<T> {
  return {
    success: true,
    message,
    ...(data !== undefined && { data }),
  };
}

/**
 * No Content Response (for delete operations)
 */
export function noContentResponse(
  message: string = 'Deleted successfully'
): ApiResponse<null> {
  return {
    success: true,
    message,
    data: null,
  };
}

/**
 * Validation Error Response
 */
export function validationErrorResponse(
  errors: Array<{ field: string; message: string }>
): ApiResponse<null> {
  return {
    success: false,
    message: 'Validation failed',
    data: null,
    errors,
  };
}
