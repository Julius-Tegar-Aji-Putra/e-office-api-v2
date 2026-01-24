import { config } from "./config.ts";
import { prisma } from "@backend/db/index.ts";
import { app } from "./server.ts";
import os from "os";

const signals = ["SIGINT", "SIGTERM"];

for (const signal of signals) {
	process.on(signal, async () => {
		console.log(`Received ${signal}. Initiating graceful shutdown...`);
		await app.stop();
		process.exit(0);
	});
}

process.on("uncaughtException", (error) => {
	console.error(error);
});

process.on("unhandledRejection", (error) => {
	console.error(error);
});

// Tunggu database connect dulu
await prisma.$connect();
console.log("✅ Database connected!");


app.listen({
	port: config.PORT || 3079,
	hostname: '0.0.0.0' 
}, (server) => {
	// Logic Mencari IP Address (Wi-Fi/LAN)
	const networkInterfaces = os.networkInterfaces();
	const ips: string[] = [];

	Object.keys(networkInterfaces).forEach((ifname) => {
		networkInterfaces[ifname]?.forEach((iface) => {
			// Kita cari IPv4 yang bukan localhost (127.0.0.1)
			if ('IPv4' !== iface.family || iface.internal) {
				return;
			}
			ips.push(iface.address);
		});
	});

	// Tampilkan Kotak Info Keren ala Vite
	console.log('\n🚀 E-OFFICE BACKEND IS READY!');
	console.log('------------------------------------------------');
	console.log(`➜  Local:   http://localhost:${server?.port}`);
	
	// Tampilkan semua IP yang ketemu (biasanya IP Wi-Fi ada di sini)
	ips.forEach(ip => {
		console.log(`➜  Network: http://${ip}:${server?.port}`);
	});
	
	console.log(`➜  Swagger: http://${ips[0] || 'localhost'}:${server?.port}/docs`);
	console.log('------------------------------------------------\n');
});
