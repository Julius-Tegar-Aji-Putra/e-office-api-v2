import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Elysia } from "elysia";
import { getUserRoles } from "@backend/lib/casbin.ts";
import { db } from "@backend/db/index.ts";

export default new Elysia().use(authGuardPlugin).get(
	"/",
	async ({ user }) => {
		// Get user roles from Casbin
		const roles = await getUserRoles(user.id);
		const primaryRole = roles[0] || null;

		// Get additional user details
		const userDetails = await db.user.findUnique({
			where: { id: user.id },
			include: {
				mahasiswa: {
					select: {
						nim: true,
						departemenId: true,
						programStudiId: true,
						departemen: { select: { id: true, name: true, code: true } },
						programStudi: { select: { id: true, name: true, code: true } },
					},
				},
				pegawai: {
					select: {
						nip: true,
						jabatan: true,
						departemenId: true,
						programStudiId: true,
						departemen: { select: { id: true, name: true, code: true } },
						programStudi: { select: { id: true, name: true, code: true } },
					},
				},
			},
		});

		return {
			id: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			emailVerified: user.emailVerified,
			role: primaryRole,
			roles: roles,
			profile: userDetails?.mahasiswa || userDetails?.pegawai || null,
			departemen: userDetails?.mahasiswa?.departemen || userDetails?.pegawai?.departemen || null,
			programStudi: userDetails?.mahasiswa?.programStudi || userDetails?.pegawai?.programStudi || null,
		};
	},
	{
		detail: {
			tags: ['User'],
			summary: 'Get current user profile',
			description: 'Mengambil data user yang sedang login beserta role dan profil',
		},
	},
);
