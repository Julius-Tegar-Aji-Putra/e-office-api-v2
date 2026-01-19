/**
 * Global Type Declarations for Hono Context
 * Extends Hono's context with custom variables
 */

import { JWTPayload } from './shared/middleware/auth.middleware';

declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload;
    requestId: string;
    requestTime: number;
  }
}
