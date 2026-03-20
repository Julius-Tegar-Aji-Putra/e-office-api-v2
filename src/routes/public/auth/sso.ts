/**
 * SSO FSM UNDIP Integration Routes
 *
 * Endpoint:
 *   GET /auth/sso             — Dipanggil SSO server saat user klik kartu aplikasi
 *   GET /auth/sso/redirect    — Redirect browser dari SSO backend ke frontend (Flow A)
 *   GET /api/auth/sso/set-session — Frontend panggil ini untuk convert raw token → Better Auth cookie
 */

import { Elysia } from "elysia";
import { prisma } from "../../../db";
import { assignRoleToUser } from "../../../lib/casbin";

import { randomBytes, createHmac } from "crypto";

const SSO_API_URL =
  process.env.SSO_API_URL ?? "https://apps-fsm.undip.ac.id/sso_api";
const FE_URL =
  process.env.FE_URL ?? "https://apps-fsm.undip.ac.id/persuratan-sk-st";

// Mapping role SSO → role DB lokal
const ssoRoleToDbRole: Record<string, string> = {
  mahasiswa:  "MAHASISWA",
  dosen:      "DOSEN",
  lecturer:   "DOSEN",
  staf:       "STAF_AKADEMIK",
  staff:      "STAF_AKADEMIK",
  superadmin: "SUPERADMIN",
};

export const ssoRoutes = new Elysia()

  .get("/auth/sso", async ({ headers, set, request }) => {
    const authHeader = headers.authorization;
    let ssoToken: string | undefined;
    if (authHeader?.startsWith("Bearer ")) {
      ssoToken = authHeader.slice(7);
    } else if (authHeader) {
      ssoToken = authHeader; 
    }

    if (!ssoToken) {
      set.status = 400;
      return { message: "Token missing" };
    }

    let ssoUser: { id: string; name: string; username: string; role: string };
    try {
      const ssoRes = await fetch(`${SSO_API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${ssoToken}` },
      });
      if (!ssoRes.ok) {
        set.status = 401;
        return { message: "Invalid SSO token" };
      }
      const ssoData = (await ssoRes.json()) as any;
      ssoUser = ssoData.data;
    } catch {
      set.status = 401;
      return { message: "Invalid SSO token" };
    }

    const email = ssoUser?.username;
    if (!email || typeof email !== "string") {
      set.status = 401;
      return { message: "Invalid SSO token payload" };
    }

    let targetRoleName = ssoRoleToDbRole[ssoUser.role.toLowerCase()] ?? null;

    if (!targetRoleName) {
      const lowerRole = ssoUser.role.toLowerCase();
      if (lowerRole.includes("mahasiswa")) targetRoleName = "MAHASISWA";
      else if (lowerRole.includes("dosen") || lowerRole.includes("lecturer")) targetRoleName = "DOSEN";
      else if (lowerRole.includes("staf") || lowerRole.includes("staff")) targetRoleName = "STAF_AKADEMIK";
      else if (lowerRole.includes("admin")) targetRoleName = "SUPERADMIN";
    }

    let user = await prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: ssoUser.name,
          email,
          emailVerified: true,
        },
        include: { userRoles: { include: { role: true } } },
      });
    } else {
      if (user.name !== ssoUser.name) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name: ssoUser.name },
        });
      }
    }

    if (targetRoleName) {
      const hasRole = user.userRoles.some((ur) => ur.role.name === targetRoleName);
      if (!hasRole) {
        let dbRole = await prisma.role.findFirst({
          where: { name: targetRoleName },
        });
        if (!dbRole) {
          dbRole = await prisma.role.create({ data: { name: targetRoleName } });
        }
        await prisma.userRole.create({
          data: { userId: user.id, roleId: dbRole.id },
        });

        await assignRoleToUser(user.id, targetRoleName);
      }
    }

    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 hari

    await prisma.session.create({
      data: {
        id: randomBytes(16).toString("hex"),
        token:     rawToken,
        userId:    user.id,
        expiresAt,
        ipAddress: request.headers.get("x-forwarded-for") ?? null,
        userAgent: request.headers.get("user-agent") ?? null,
      },
    });

    return {
      callback_url: `/sso/callback?token=${rawToken}`,
    };
  })

  .get("/auth/sso/redirect", ({ query, set }) => {
    const token = query.token as string | undefined;
    if (!token) {
      set.status = 400;
      return { message: "Token missing" };
    }
    set.status = 302;
    set.headers["Location"] = `${FE_URL}/sso/callback?token=${encodeURIComponent(token)}`;
    return null;
  })

  .get("/api/auth/sso/set-session", async ({ query, set }) => {
    const token = query.token as string | undefined;
    if (!token) {
      set.status = 400;
      return { message: "Token missing" };
    }

    const session = await prisma.session.findFirst({
      where: { token, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!session) {
      set.status = 401;
      return { message: "Invalid or expired session token" };
    }

    const secret = process.env.BETTER_AUTH_SECRET!;
    const sigBytes = createHmac("sha256", secret).update(token).digest();
    const b64sig = Buffer.from(sigBytes).toString("base64");
    const signedToken = encodeURIComponent(`${token}.${b64sig}`);

    const isProd = process.env.NODE_ENV === "production";
    const maxAge = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    const secure = isProd ? "; Secure" : "";

    set.headers["Set-Cookie"] =
      `e-office.session_token=${signedToken}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=${maxAge}`;

    return { success: true };
  });
