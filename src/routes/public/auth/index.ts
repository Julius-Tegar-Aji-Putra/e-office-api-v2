/**
 * Better Auth Routes Handler
 * Mount Better Auth ke Elysia - semua endpoint auth otomatis tersedia
 * 
 * Endpoints yang tersedia:
 * - POST /api/auth/sign-up/email - Register
 * - POST /api/auth/sign-in/email - Login
 * - POST /api/auth/sign-out - Logout
 * - GET /api/auth/session - Get current session
 * - POST /api/auth/forget-password - Request reset password
 * - POST /api/auth/reset-password - Reset password
 */

import { Elysia } from "elysia";
import { auth } from "../../../lib/auth";

export const betterAuthRoutes = new Elysia({ prefix: '/auth' })
    .all("/*", async ({ request }) => {
        return auth.handler(request);
    });

export default betterAuthRoutes;
