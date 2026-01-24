/**
 * Server Setup
 * Main Elysia server with routes registration
 * Framework: Elysia with autoload for existing routes
 */

import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { swagger } from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";

// Import Better Auth
import { auth } from "./lib/auth";

// Import module routes - Only import working modules for now
import { submissionRoutes } from './modules/submission/submission.route';
import { pengantarRoutes } from './modules/pengantar/pengantar.route';
import { disposisiRoutes } from './modules/disposisi/disposisi.route';
import { leadershipRoutes } from './modules/leadership/leadership.route';
import { hasilRoutes } from './modules/surat-hasil/hasil.route';
import { legalisasiRoute } from './modules/legalisasi/legalisasi.route';
// TODO: dashRoutes disabled - needs to be updated to match current Prisma schema
// import dashRoutes from './routes/dash';

export const app = new Elysia()
	// ==========================================
	// SWAGGER DOCUMENTATION
	// ==========================================
	.use(
		swagger({
			documentation: {
				info: {
					title: 'E-Office ST/SK Dekan API',
					version: '2.0.0',
					description: 'API untuk sistem E-Office Surat Tugas/Keputusan Dekan',
				},
				tags: [
					{ name: 'Auth', description: 'Authentication endpoints' },
					{ name: 'Dashboard', description: 'Dashboard endpoints' },
					{ name: 'Submission', description: 'Pengajuan surat endpoints' },
					{ name: 'Pengantar', description: 'Surat pengantar endpoints' },
					{ name: 'Disposisi', description: 'Disposisi fakultas endpoints' },
					{ name: 'Surat Hasil', description: 'Drafting surat tugas/keputusan' },
					{ name: 'Leadership', description: 'Verifikasi & tanda tangan pejabat' },
					{ name: 'Legalisasi', description: 'UPA processing endpoints' },
					{ name: 'Master', description: 'Master data endpoints' },
				],
			},
			path: '/docs',
		})
	)

	// ==========================================
	// CORS CONFIGURATION
	// ==========================================
	.use(
		cors({
			origin: "*", // Configure based on environment
			methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
			credentials: true,
			allowedHeaders: ["Content-Type", "Authorization"],
		}),
	)

	// ==========================================
	// SERVER TIMING
	// ==========================================
	.use(serverTiming())

	// ==========================================
	// HEALTH CHECK
	// ==========================================
	.get('/health', () => ({
		status: 'ok',
		timestamp: new Date().toISOString(),
		version: '2.0.0',
	}))

	// ==========================================
	// BETTER AUTH HANDLER
	// All auth endpoints: /api/auth/*
	// ==========================================
	.mount(auth.handler)

	// ==========================================
	// MODULE ROUTES (New ST/SK Implementation)
	// ==========================================
	.group('/api', (api) =>
		api
			// Module A: PENGAJUAN
			.use(submissionRoutes)
			// Module B: SURAT PENGANTAR
			.use(pengantarRoutes)
			// Module C: DISPOSISI
			.use(disposisiRoutes)
			// Module D: SURAT HASIL
			.use(hasilRoutes)
			// Module E: LEADERSHIP
			.use(leadershipRoutes)
			// Module F: LEGALISASI
			.use(legalisasiRoute)
			// TODO: Dashboard Routes disabled - needs schema update
			// .use(dashRoutes)
	)

	// ==========================================
	// AUTOLOAD EXISTING ROUTES
	// ==========================================
	.use(
		await autoload({
			pattern: "**/*.ts",
			dir: "./routes",
			// Exclude disabled modules and master routes
			ignore: ["**/*.disabled", "**/*.disabled/**", "**/master/**"],
			types: {
				output: "./autogen.routes.ts",
				typeName: "App",
				useExport: true,
			},
		}),
	)

export type App = typeof app;
