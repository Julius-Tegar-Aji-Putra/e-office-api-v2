/**
 * Database Client
 * Prisma client singleton untuk database operations
 */

import { PrismaClient, Prisma as PrismaNamespace } from "@backend/generated/prisma/client.ts";

const globalForPrisma = globalThis as unknown as {
	prismaClient: PrismaClient | undefined;
};

const prismaClient =
	globalForPrisma.prismaClient ??
	new PrismaClient({
		log: process.env.NODE_ENV === 'development' 
			? ["query", "info", "warn", "error"]
			: ["error"],
	});

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prismaClient = prismaClient;
}

// Export instance with different aliases
export const prisma = prismaClient;
export const db = prismaClient;
export const Prisma = PrismaNamespace;

export * from "@backend/generated/prisma/client.ts";
