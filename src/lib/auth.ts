import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@backend/db/index.ts";
import os from "os";

const prisma = new PrismaClient();

function getAllLocalIps() {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]!) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips; 
}

const localIps = getAllLocalIps();

// 1. TAMBAHKAN INI: Ambil port dari .env, default 3000 kalau kosong
const frontendPort = process.env.FRONTEND_PORT || "3000"; 

console.log(`🔒 Auth System trusting frontend at ports ${frontendPort} on IPs:`, localIps);

export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),

    basePath: "/api/auth",

    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        maxPasswordLength: 32,
    },

    session: {
        expiresIn: 60 * 60 * 24 * 7, 
        updateAge: 60 * 60 * 24, 
        cookieCache: {
            enabled: true,
            maxAge: 60 * 5, 
        },
    },

    advanced: {
        cookiePrefix: "e-office",
    },

    trustedOrigins: [
        "http://localhost:3000",      
        "http://localhost:5173",
        `http://localhost:${frontendPort}`, // 2. Daftarkan localhost dengan port dinamis

        // 3. UBAH INI: Gunakan variabel frontendPort, bukan angka mati 3000
        ...localIps.map(ip => `http://${ip}:${frontendPort}`),

        // 4. (Opsional tapi sangat aman) Daftarkan URL frontend server secara eksplisit
        process.env.BETTER_AUTH_TRUSTED_ORIGINS || "http://10.137.58.124:20091",
        "https://apps-fsm.undip.ac.id"
    ],
});