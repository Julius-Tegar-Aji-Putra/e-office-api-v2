import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Elysia } from "elysia";
import { getUserRoles } from "@backend/lib/casbin.ts";
import { db } from "@backend/db/index.ts";

export default new Elysia().use(authGuardPlugin).get(
	"/",
	async ({ user, set }) => {
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

		// Block inactive (soft-deleted) users
		if (userDetails?.deletedAt) {
			set.status = 403;
			return {
				error: 'ACCOUNT_INACTIVE',
				message: 'Akun Anda telah dinonaktifkan. Silakan hubungi Super Admin.',
			};
		}

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
)
.post(
	"/profile",
	async ({ user, body, set }) => {
		const roles = await getUserRoles(user.id);
		const isMahasiswa = roles.includes("MAHASISWA");
		const isPegawai = roles.includes("DOSEN") || roles.includes("STAF_AKADEMIK") || roles.includes("SUPERVISOR");

		const { nim, nip, jabatan, noHp, departemenId, programStudiId, tahunMasuk } = body as any;

		if (isMahasiswa) {
			await db.mahasiswa.upsert({
				where: { userId: user.id },
				update: {
					nim,
					noHp,
					departemenId,
					programStudiId,
					tahunMasuk: tahunMasuk || new Date().getFullYear().toString(),
				},
				create: {
					userId: user.id,
					nim,
					noHp,
					departemenId,
					programStudiId,
					tahunMasuk: tahunMasuk || new Date().getFullYear().toString(),
				},
			});
		} else if (isPegawai) {
			await db.pegawai.upsert({
				where: { userId: user.id },
				update: {
					nip,
					noHp,
					jabatan: jabatan || roles[0],
					departemenId,
					programStudiId,
				},
				create: {
					userId: user.id,
					nip,
					noHp,
					jabatan: jabatan || roles[0],
					departemenId,
					programStudiId,
				},
			});
		} else {
			set.status = 400;
			return { message: "User role does not support profile details" };
		}

		return { success: true, message: "Profil berhasil diperbarui" };
	},
	{
		detail: {
			tags: ['User'],
			summary: 'Update current user profile',
			description: 'Memperbarui data profil Mahasiswa atau Pegawai',
		},
	}
);
