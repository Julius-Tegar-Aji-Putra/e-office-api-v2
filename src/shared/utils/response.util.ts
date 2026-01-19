/**
 * Response Utility
 * Standard API response formatter
 */

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: any;
}

export const successResponse = <T = any>(
  message: string,
  data?: T,
  meta?: any,
): ApiResponse<T> => {
  return {
    success: true,
    message,
    ...(data !== undefined && { data }),
    ...(meta && { meta }),
  };
};

export const errorResponse = (message: string, error?: any): ApiResponse => {
  return {
    success: false,
    message,
    ...(error && { error }),
  };
};
