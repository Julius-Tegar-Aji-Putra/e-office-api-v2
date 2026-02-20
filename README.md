# E-Office API v2 (Backend)

Backend service untuk sistem E-Office (Surat Tugas & SK Dekan) Fakultas Sains dan Matematika Universitas Diponegoro. Dibangun di atas runtime **Bun** dengan framework **ElysiaJS**, menggunakan arsitektur **Modular Monolith** untuk skalabilitas dan maintenance yang lebih baik.

## 🏗 Arsitektur: Modular Monolith

Codebase ini diorganisir berdasarkan **Domain Modules** di dalam folder `src/modules`. Setiap modul bertanggung jawab atas fitur spesifik dan memiliki isolasi logis.

### Struktur Modul Utama (`src/modules`)
-   **`admin-management`**: Manajemen admin dan hak akses.
-   **`dashboard-stats`**: Agregasi data untuk dashboard.
-   **`department-approval`**: Logika persetujuan level departemen/prodi.
-   **`faculty-approval`**: Logika persetujuan level fakultas/dekanat.
-   **`submission`**: Core module untuk pengajuan surat.
-   **`surat-hasil`**: Generasi dan manajemen surat hasil (SK/Surat Tugas).
-   **`signature`**: Modul tanda tangan elektronik (TTE).
-   **`tembusan`**: Manajemen notifikasi tembusan surat.
-   **`files`**: Manajemen upload dan storage file (MinIO).

### Tech Stack
-   **Runtime**: [Bun](https://bun.sh) (JavaScript Runtime & Package Manager)
-   **Framework**: [ElysiaJS](https://elysiajs.com) (High Performance Web Framework)
-   **Database**: PostgreSQL dengan [Prisma ORM](https://www.prisma.io)
-   **Authentication**: [Better Auth](https://better-auth.com)
-   **Validation**: [TypeBox](https://github.com/sinclairzx81/typebox) / Zod
-   **Storage**: MinIO (S3 Compatible Object Storage)

---

## 🚀 Setup & Installation (Staging)

Ikuti langkah-langkah berikut secara berurutan untuk menjalankan backend di environment staging/dev.

### Staging Backend
1. Instalasi Package 
```bash
bun install
```
2. Copy env example & Sesuaikan env
```bash
cp .env.example .env
```
3. Setup Docker (Pastikan aplikasi Docker sudah menyala):
```bash
docker-compose -f docker-compose.dev.yml up -d postgres minio createbuckets
```
4. Generate Client
```bash
bunx prisma generate
```
5. Migrate
```bash
bunx prisma migrate deploy
```
6. Seeding
```bash
bunx prisma db seed
```
7. Run App
```bash
bun dev
```

---

## 🗄 Database Management

Backend ini menggunakan **Prisma** sebagai ORM. File schema database terletak di `prisma/schema.prisma`.

-   **Generate Client**: `bunx prisma generate` (Jalankan setiap kali ada perubahan schema)
-   **Migrate DB**: `bunx prisma migrate dev` (Untuk development) atau `deploy` (Untuk staging/prod)
-   **Seed Data**: `bunx prisma db seed` (Mengisi data awal seperti roles, admin default, dll)