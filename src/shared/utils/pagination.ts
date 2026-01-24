/**
 * Pagination Helper Utilities
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResult {
  skip: number;
  take: number;
  page: number;
  limit: number;
}

/**
 * Default pagination values
 */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

/**
 * Parse and validate pagination params
 */
export function parsePagination(params: PaginationParams): PaginationResult {
  let page = Math.max(1, Number(params.page) || DEFAULT_PAGE);
  let limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.limit) || DEFAULT_LIMIT));

  return {
    skip: (page - 1) * limit,
    take: limit,
    page,
    limit,
  };
}

/**
 * Build Prisma orderBy from params
 */
export function buildOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
  allowedFields: string[] = ['createdAt', 'updatedAt']
): Record<string, 'asc' | 'desc'> | undefined {
  if (!sortBy || !allowedFields.includes(sortBy)) {
    return { createdAt: 'desc' };
  }
  return { [sortBy]: sortOrder };
}

/**
 * Calculate pagination metadata
 */
export function calculateMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  };
}

/**
 * Build cursor-based pagination (for infinite scroll)
 */
export interface CursorPaginationParams {
  cursor?: string;
  take?: number;
}

export function parseCursorPagination(params: CursorPaginationParams) {
  const take = Math.min(MAX_LIMIT, Math.max(1, Number(params.take) || DEFAULT_LIMIT));
  
  return {
    take: take + 1, // Fetch one extra to check if there's more
    ...(params.cursor && { cursor: { id: params.cursor }, skip: 1 }),
  };
}

export function processCursorResult<T extends { id: string }>(
  items: T[],
  take: number
): { data: T[]; nextCursor: string | null } {
  const hasMore = items.length > take;
  const data = hasMore ? items.slice(0, -1) : items;
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  return { data, nextCursor };
}
