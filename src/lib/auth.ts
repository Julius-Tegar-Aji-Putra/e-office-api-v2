/**
 * Better Auth Configuration
 * Konfigurasi authentication dengan Better Auth + Prisma
 */
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@backend/db/index.ts";

const prisma = new PrismaClient();

export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	
	// Base path untuk semua auth endpoints
	basePath: "/api/auth",
	
	// Email & Password Authentication
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
		maxPasswordLength: 32,
	},
	
	// Session Configuration
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 Hari
		updateAge: 60 * 60 * 24, // Update setiap 1 hari
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5, // 5 menit cache
		},
	},
	
	// Advanced Configuration
	advanced: {
		generateId: () => crypto.randomUUID(),
	},
	
	// Trusted Origins (untuk CORS)
	trustedOrigins: [
		"http://localhost:3000",
		"http://localhost:3001", 
		"http://localhost:5173",
	],
});
