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

console.log(`🔒 Auth System trusting frontend at ports 3000 on IPs:`, localIps);

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
        
        ...localIps.map(ip => `http://${ip}:3000`) 
    ],
});