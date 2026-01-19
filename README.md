# E-Office API v2

Backend API untuk sistem E-Office dengan arsitektur modular berbasis feature/subsystem.

## 📋 Daftar Isi

- [Tech Stack](#-tech-stack)
- [Arsitektur Aplikasi](#-arsitektur-aplikasi)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Development](#-development)
- [Database Migrations](#-database-migrations)
- [Production](#-production)
- [API Documentation](#-api-documentation)

## 🛠 Tech Stack

- **Runtime**: [Bun](https://bun.sh/) / Node.js
- **Web Framework**: [Hono](https://hono.dev/) - Fast, lightweight web framework
- **Database**: [PostgreSQL](https://www.postgresql.org/) via [Prisma ORM](https://www.prisma.io/)
- **Authentication**: JWT (JSON Web Tokens)
- **Authorization**: [Casbin](https://casbin.org/) - Role-based access control
- **File Storage**: [MinIO](https://min.io/) - S3-compatible object storage
- **Linter**: [Biome](https://biomejs.dev/)
- **Language**: TypeScript
- **Validation**: [Zod](https://zod.dev/)

## 🏗 Arsitektur Aplikasi

Aplikasi ini menggunakan **Feature-Based Modular Architecture** dengan struktur:

```
src/
├── app.ts                    # Inisialisasi aplikasi & middleware
├── server.ts                 # Entry point server
├── routes.ts                 # Central route registry
│
├── config/                   # Konfigurasi aplikasi
│   ├── env.ts               # Environment variables
│   ├── database.ts          # Database connection
│   └── auth.ts              # Auth configuration
│
├── shared/                   # Shared resources (ZONA MERAH)
│   ├── middleware/          # Global middleware
│   ├── utils/               # Utility functions
│   ├── constants/           # Global constants
│   └── types/               # Global TypeScript types
│
└── modules/                  # Feature-based modules
    ├── submission/          # Subsystem Pengajuan Surat
    ├── pengantar/           # Subsystem Surat Pengantar
    ├── disposisi/           # Subsystem Disposisi
    ├── leadership/          # Subsystem Verifikasi Pimpinan
    ├── surat-hasil/         # Subsystem Surat Hasil & Tanda Tangan
    └── legalisasi/          # Subsystem Legalisasi & Distribusi
```

Setiap modul memiliki struktur:
- `*.controller.ts` - HTTP request/response handler
- `*.service.ts` - Business logic
- `*.repository.ts` - Database access layer
- `*.route.ts` - Route definitions
- `*.validation.ts` - Input validation schemas
- `*.types.ts` - TypeScript type definitions

## 📦 Installation

### Prerequisites

- **Bun** >= 1.0 (atau Node.js >= 18)
- **PostgreSQL** >= 14
- **Docker** & **Docker Compose** (optional, untuk development)

### 1. Clone Repository

```bash
git clone <repository-url>
cd e-office-monorepo/e-office-api-v2
```

### 2. Install Dependencies

#### Menggunakan Bun (Recommended):
```bash
bun install
```

#### Menggunakan NPM:
```bash
npm install
```

#### Menggunakan Yarn:
```bash
yarn install
```

### 3. Install Additional Dependencies untuk Struktur Baru

Aplikasi ini memerlukan beberapa dependencies tambahan untuk struktur modular:

```bash
# Menggunakan Bun
bun add hono @hono/node-server
bun add zod
bun add jsonwebtoken
bun add bcryptjs
bun add -d @types/jsonwebtoken @types/bcryptjs

# Menggunakan NPM
npm install hono @hono/node-server
npm install zod jsonwebtoken bcryptjs
npm install -D @types/jsonwebtoken @types/bcryptjs
```

## ⚙️ Configuration

### 1. Environment Variables

Copy file `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

### 2. Edit file `.env`

Sesuaikan konfigurasi dengan environment Anda:

```env
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/e_office_db?schema=public"

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# MinIO (Optional)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
```

### 3. Generate JWT Secret

Generate secure JWT secret:

```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## 🚀 Development

### 1. Start Development Services

Jalankan PostgreSQL dan MinIO menggunakan Docker Compose:

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 2. Setup Database

Generate Prisma Client dan jalankan migrations:

```bash
# Generate Prisma Client
bunx prisma generate

# Jalankan migrations
bunx prisma migrate dev

# (Optional) Seed database
bunx prisma db seed
```

### 3. Start Development Server

```bash
bun dev
```

Server akan berjalan di `http://localhost:3000`

## 📊 Database Migrations

Start development services (DB, Redis etc):

```bash
docker compose -f docker-compose.dev.yml up
```

Start the project:

```bash
bun dev
```

### Generate New Migration

Setelah mengubah schema di `prisma/schema.prisma`:

```bash
bunx prisma migrate dev --name migration_name
```

### Apply Migrations (Production)

```bash
bunx prisma migrate deploy
```

### Reset Database (Development Only)

⚠️ **WARNING**: Ini akan menghapus semua data!

```bash
bunx prisma migrate reset
```

### Prisma Studio (Database GUI)

Buka Prisma Studio untuk melihat dan edit data:

```bash
bunx prisma studio
```

## 🏭 Production

### 1. Build & Run dengan Docker

```bash
# Build dan jalankan semua services
docker compose up -d
```

### 2. Manual Deployment

```bash
# Install dependencies (production only)
bun install --production

# Run migrations
bunx prisma migrate deploy

# Start server
NODE_ENV=production bun start
```

## 📚 API Documentation

### Health Check

```bash
GET /health
```

### Public Routes (No Auth)

- `POST /public/register` - Register user baru
- `POST /public/sign-in` - Login
- `GET /public/auth/sso/callback` - SSO callback

### Protected Routes (Require JWT Token)

**Submission (Pengajuan Surat)**
- `GET /api/submission` - List pengajuan
- `POST /api/submission` - Buat pengajuan
- `GET /api/submission/:id` - Detail pengajuan
- `PUT /api/submission/:id` - Update pengajuan
- `POST /api/submission/:id/submit` - Submit pengajuan
- `DELETE /api/submission/:id` - Hapus pengajuan

**Pengantar (Surat Pengantar)**
- `GET /api/pengantar` - List surat pengantar
- `GET /api/pengantar/:id` - Detail surat pengantar
- `POST /api/pengantar/:submissionId/generate` - Generate surat pengantar
- `POST /api/pengantar/:id/approve` - Approve surat
- `POST /api/pengantar/:id/reject` - Reject surat

**Disposisi**
- `GET /api/disposisi` - List disposisi
- `GET /api/disposisi/:id` - Detail disposisi
- `POST /api/disposisi` - Buat disposisi
- `POST /api/disposisi/:id/process` - Proses disposisi

**Leadership (Pimpinan)**
- `GET /api/leadership/pending` - List pending approval
- `POST /api/leadership/:submissionId/approve` - Approve
- `POST /api/leadership/:submissionId/reject` - Reject
- `POST /api/leadership/:submissionId/redispose` - Disposisi ulang

**Surat Hasil & Tanda Tangan**
- `GET /api/surat-hasil` - List surat hasil
- `GET /api/surat-hasil/:id` - Detail surat hasil
- `GET /api/surat-hasil/:id/signatures` - Antrian tanda tangan
- `POST /api/surat-hasil/:submissionId/generate` - Generate surat hasil
- `POST /api/surat-hasil/:id/sign` - Tanda tangan dokumen

**Legalisasi & Distribusi**
- `GET /api/legalisasi/pending` - List pending legalisasi
- `GET /api/legalisasi/archive` - Arsip dokumen
- `GET /api/legalisasi/:id` - Detail legalisasi
- `POST /api/legalisasi/:suratHasilId/process` - Proses legalisasi
- `POST /api/legalisasi/:id/distribute` - Distribusi surat

**Master Data**
- `GET|POST /api/master/user` - Manage users
- `GET|POST /api/master/role` - Manage roles
- `GET|POST /api/master/permission` - Manage permissions
- `GET|POST /api/master/departemen` - Manage departemen
- `GET|POST /api/master/prodi` - Manage program studi
- `GET|POST /api/master/mahasiswa` - Manage mahasiswa
- `GET|POST /api/master/pegawai` - Manage pegawai
- `GET|POST /api/master/surat-type` - Manage jenis surat
- `GET|POST /api/master/surat-template` - Manage template surat

### Authentication

Semua protected routes memerlukan JWT token di header:

```bash
Authorization: Bearer <your-jwt-token>
```

Contoh menggunakan curl:

```bash
curl -H "Authorization: Bearer eyJhbGc..." http://localhost:3000/api/submission
```

## 🧪 Testing

```bash
# Run tests
bun test

# Run tests with coverage
bun test --coverage
```

## 📝 Code Quality

### Linting

```bash
# Check code quality
bun lint

# Auto-fix issues
bun lint:fix
```

### Format Code

```bash
bunx @biomejs/biome format --write src
```

## 🔒 Security Best Practices

1. **Jangan commit file `.env`** ke repository
2. **Gunakan JWT secret yang kuat** (minimal 32 karakter random)
3. **Rotasi JWT secret** secara berkala di production
4. **Enable HTTPS** di production
5. **Set CORS origins** sesuai dengan domain frontend
6. **Validasi semua input** menggunakan Zod schemas
7. **Implement rate limiting** untuk API endpoints

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License.

## 👥 Team

E-Office Development Team

---

**Happy Coding! 🚀**