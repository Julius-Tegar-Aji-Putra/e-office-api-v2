# Backend API E-Office

> RESTful API untuk sistem E-Office dengan arsitektur modular berbasis feature/subsystem. Dibangun menggunakan Hono, TypeScript, Prisma ORM, dan Bun.

## 📋 Table of Contents

- [Tech Stack](#-tech-stack)
- [Persiapan Database](#-persiapan-database)
- [Instalasi & Setup Project](#-instalasi--setup-project)
- [Project Structure](#-project-structure)
- [API Documentation](#-api-documentation)
- [Development Conventions](#-development-conventions)
- [Best Practices](#-best-practices)

---

## 🛠 Tech Stack

- **Runtime**: [Bun](https://bun.sh/) - Fast all-in-one JavaScript runtime
- **Web Framework**: [Hono](https://hono.dev/) - Ultra-fast, lightweight web framework
- **Database**: [PostgreSQL](https://www.postgresql.org/) (via Docker)
- **ORM**: [Prisma](https://www.prisma.io/) - Next-generation TypeScript ORM
- **Authentication**: JWT (JSON Web Tokens)
- **Authorization**: [Casbin](https://casbin.org/) - Role-based access control (RBAC)
- **File Storage**: [MinIO](https://min.io/) - S3-compatible object storage
- **Validation**: [Zod](https://zod.dev/) - TypeScript-first schema validation
- **Code Quality**: [Biome](https://biomejs.dev/) - Fast linter & formatter
- **Language**: TypeScript


---

## 🗄️ Persiapan Database

**⚠️ PENTING: Database harus sudah running sebelum menjalankan aplikasi!**

### Prerequisites

- [Docker](https://www.docker.com/get-started) & [Docker Compose](https://docs.docker.com/compose/install/) terinstall
- [Bun](https://bun.sh/) terinstall (`curl -fsSL https://bun.sh/install | bash`)
- Git

### 1. Menyalakan Database via Docker Compose

Project ini menggunakan **Docker Compose** untuk menjalankan PostgreSQL dan MinIO (object storage).

```bash
# Pastikan Anda berada di folder e-office-api-v2
cd e-office-api-v2

# Start database services (PostgreSQL + MinIO)
docker-compose -f docker-compose.dev.yml up -d
```

**Penjelasan flags:**
- `-f docker-compose.dev.yml`: Gunakan file compose untuk development
- `up`: Start services
- `-d`: Detached mode (background)

**Verify services running:**

```bash
# Check running containers
docker ps

# Expected output:
# - PostgreSQL on port 5432
# - MinIO on port 9000 (API) and 9001 (Console)
```

### 2. Setup Environment Variables (.env)

Copy file `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

**Edit file `.env`** dan sesuaikan konfigurasi:

```env
# Application
NODE_ENV=development
PORT=3001

# Database Connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/e_office_db?schema=public"

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# MinIO Object Storage
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET_NAME=e-office-files

# CORS (Frontend URL)
FRONTEND_URL=http://localhost:3000
```

**⚠️ Security Notes:**
- Ganti `JWT_SECRET` dengan random string yang kuat (min 32 karakter)
- Jangan commit file `.env` ke Git (sudah ada di `.gitignore`)

**Generate Secure JWT Secret:**

```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 3. Stop Database Services

Ketika selesai development:

```bash
# Stop services (data tetap tersimpan)
docker-compose -f docker-compose.dev.yml down

# Stop dan hapus semua data (⚠️ HATI-HATI!)
docker-compose -f docker-compose.dev.yml down -v
```

---

## 🚀 Instalasi & Setup Project

### 1. Install Dependencies

```bash
# Pastikan Anda berada di folder e-office-api-v2
cd e-office-api-v2

# Install semua dependencies menggunakan Bun
bun install
```

**Note**: Project ini menggunakan **Bun** sebagai package manager dan runtime. Jangan gunakan npm atau yarn untuk consistency.

---

### 2. Database Workflow (⚠️ WAJIB DIJALANKAN BERURUTAN)

Setelah database Docker running dan `.env` sudah di-setup, jalankan workflow berikut **SECARA BERURUTAN**:

#### Step 1: Generate Prisma Client

Prisma Client adalah auto-generated query builder yang type-safe. Harus di-generate setiap kali schema berubah.

```bash
bunx prisma generate
```

**Output yang diharapkan:**
```
✔ Generated Prisma Client to ./node_modules/@prisma/client
```

**Kapan harus run lagi?**
- Setelah git pull yang mengubah `prisma/schema.prisma`
- Setelah menambah/mengubah model di schema
- Setelah fresh install dependencies

---

#### Step 2: Migrasi Database

Migration akan membuat/update tabel di database berdasarkan Prisma schema.

```bash
# Development: Create migration dan apply ke DB
bunx prisma migrate dev --name init

# Alternative: Apply existing migrations only
bunx prisma migrate deploy
```

**Penjelasan:**
- `migrate dev`: Development mode - generate SQL migration file + apply ke DB
- `--name init`: Nama migration (bisa diganti, misal: `add_user_table`)
- `migrate deploy`: Production mode - hanya apply existing migrations

**Expected Output:**
```
✔ Applying migration `20251217165014_init`
✔ Generated Prisma Client
Database schema updated successfully!
```

**Prisma Migration Files:**
```
prisma/migrations/
├── migration_lock.toml
└── 20251217165014_init/
    └── migration.sql     # SQL yang dijalankan ke database
```

---

#### Step 3: Seeding Data Awal (Optional tapi Recommended)

Seeding mengisi database dengan data awal (admin user, roles, sample data, dll).

```bash
bunx prisma db seed
```

**⚠️ Catatan:**
- Seed configuration ada di `package.json` → `prisma.seed`
- Seed script ada di `src/db/seed.ts` atau `prisma/seed.ts`
- Berguna untuk development agar ada data untuk testing

**Expected Output:**
```
🌱 Seeding database...
✅ Created admin user
✅ Created roles and permissions
✅ Database seeded successfully!
```

---

#### Step 4: Verify Database Setup

Buka Prisma Studio untuk verify data:

```bash
bunx prisma studio
```

Akan membuka browser di `http://localhost:5555` dengan GUI untuk explore database.

---

### 3. Menjalankan Development Server

Setelah semua setup selesai, jalankan server:

```bash
# Development mode (with hot reload)
bun dev

# Alternative: Production mode
bun run start
```

**Expected Output:**
```
🚀 Server running on http://localhost:3001
✅ Database connected
✅ Casbin enforcer loaded
```

Server akan berjalan di **http://localhost:3001**

---

### 4. Quick Start Summary (Cheat Sheet)

Untuk setup dari awal:

```bash
# 1. Start database
docker-compose -f docker-compose.dev.yml up -d

# 2. Setup environment
cp .env.example .env
# Edit .env dengan config yang sesuai

# 3. Install dependencies
bun install

# 4. Database workflow (BERURUTAN!)
bunx prisma generate          # Generate Prisma Client
bunx prisma migrate dev       # Apply migrations
bunx prisma db seed          # Seed initial data

# 5. Start server
bun dev
```

**Troubleshooting:**
- Jika error `P1001` (can't reach database): Pastikan Docker services running
- Jika error `P3009` (migration failed): Check DATABASE_URL di `.env`
- Jika error TypeScript: Run `bunx prisma generate` lagi

---

## 📁 Project Structure

Proyek ini menggunakan **Feature-Based Modular Architecture** yang memisahkan kode berdasarkan domain bisnis/fitur.

```
e-office-api-v2/
├── prisma/                          # Prisma ORM
│   ├── schema.prisma                # Database schema definition
│   ├── migrations/                  # Auto-generated migration files
│   └── prismabox/                   # Prisma utilities
│
├── src/
│   ├── server.ts                    # Entry point server (start here)
│   ├── app.ts                       # Hono app instance & global middleware
│   ├── routes.ts                    # Central route registry
│   ├── config.ts                    # App-wide configuration
│   ├── types.ts                     # Global type definitions
│   │
│   ├── config/                      # Configuration modules
│   │   ├── env.ts                   # Environment variables validation (Zod)
│   │   ├── database.ts              # Prisma client singleton
│   │   └── auth.ts                  # JWT & Auth configuration
│   │
│   ├── db/                          # Database utilities
│   │   ├── index.ts                 # Prisma client export
│   │   └── seed.ts                  # Database seeding script
│   │
│   ├── lib/                         # External library wrappers
│   │   ├── auth.ts                  # JWT utilities
│   │   └── casbin.ts                # Casbin RBAC setup
│   │
│   ├── middlewares/                 # Global middleware
│   │   ├── auth.ts                  # JWT verification middleware
│   │   └── context.ts               # Request context middleware
│   │
│   ├── shared/                      # 🔴 ZONA MERAH - Shared Resources
│   │   ├── middleware/              # Reusable middleware
│   │   ├── utils/                   # Utility functions
│   │   ├── constants/               # Global constants
│   │   └── types/                   # Shared TypeScript types
│   │
│   ├── modules/                     # 🟢 Feature Modules (Business Logic)
│   │   ├── submission/              # Pengajuan Surat
│   │   ├── pengantar/               # Surat Pengantar
│   │   ├── disposisi/               # Disposisi
│   │   ├── leadership/              # Verifikasi Pimpinan
│   │   ├── surat-hasil/             # Surat Hasil & Tanda Tangan
│   │   └── legalisasi/              # Legalisasi & Distribusi
│   │
│   ├── routes/                      # Route handlers
│   │   ├── dash.ts                  # Dashboard routes
│   │   ├── me.ts                    # Current user routes
│   │   ├── master/                  # Master data CRUD routes
│   │   └── public/                  # Public routes (no auth)
│   │
│   └── services/                    # External service integrations
│       ├── minio.service.ts         # MinIO file storage
│       ├── locks.ts                 # Distributed locks
│       └── database_models/         # Auto-generated CRUD services
│
├── casbin/                          # Casbin RBAC configuration
│   └── model.conf                   # Access control model
│
├── docker-compose.dev.yml           # Development services (DB, MinIO)
├── docker-compose.yml               # Production services
├── Dockerfile                       # Production container image
├── package.json                     # Dependencies & scripts
├── tsconfig.json                    # TypeScript configuration
├── biome.json                       # Biome linter/formatter config
└── .env.example                     # Environment variables template
```

---

### 🔴 Shared Folder (ZONA MERAH) - Critical Explanation

Folder `src/shared/` adalah **ZONA MERAH** yang berisi kode generic dan reusable di seluruh aplikasi.

```
shared/
├── middleware/              # Generic middleware
│   ├── error-handler.ts    # Global error handling
│   ├── logger.ts           # Request/response logging
│   ├── rate-limit.ts       # Rate limiting
│   └── validator.ts        # Generic Zod validation middleware
│
├── utils/                  # Utility functions
│   ├── response.ts         # Standardized API response format
│   ├── date.ts             # Date manipulation helpers
│   ├── string.ts           # String utilities
│   └── pagination.ts       # Pagination helpers
│
├── constants/              # Global constants
│   ├── http-status.ts      # HTTP status codes
│   ├── error-messages.ts   # Standard error messages
│   └── roles.ts            # User role definitions
│
└── types/                  # Shared TypeScript types
    ├── api.ts              # API request/response types
    ├── auth.ts             # Auth-related types
    └── pagination.ts       # Pagination types
```

**🚨 Rules untuk Shared Folder:**

1. ✅ **DO's**:
   - Simpan kode yang **truly generic** dan dipakai di **3+ modules**
   - Simpan utility functions yang **tidak ada business logic**
   - Simpan types yang **global** (User, Auth, Pagination, dll)
   - Test thoroughly sebelum add ke shared (karena affect banyak module)

2. ❌ **DON'Ts**:
   - **Jangan sering ubah** kode di shared (affects all modules!)
   - **Jangan taruh business logic** di shared (masuk ke modules)
   - **Jangan taruh feature-specific code** (belongs to modules)
   - **Jangan taruh kode yang hanya dipakai 1-2 modules**

3. ⚖️ **Decision Tree**: "Apakah ini masuk Shared?"
   ```
   ❓ Apakah dipakai di 3+ modules? 
      ❌ NO  → Taruh di module specific
      ✅ YES → Lanjut pertanyaan berikutnya
   
   ❓ Apakah purely utility/helper tanpa business logic?
      ❌ NO  → Taruh di module specific
      ✅ YES → OK masuk ke shared
   
   ❓ Apakah stable dan jarang berubah?
      ❌ NO  → Pertimbangkan taruh di module dulu
      ✅ YES → ✅ OK masuk ke shared
   ```

**Kenapa "ZONA MERAH"?**
- Changes di shared **affects ALL modules** yang menggunakannya
- Butuh **extra careful testing** sebelum modify
- Breaking changes di shared = **multiple modules break**

---

### 🟢 Modules Folder (Feature-Based Architecture)

Folder `src/modules/` adalah **inti aplikasi** yang berisi business logic per feature/subsystem.

**Philosophy**: Setiap module adalah **self-contained unit** yang handle satu domain bisnis spesifik.

#### Available Modules:

```
modules/
├── submission/              # 📝 Pengajuan Surat (Create & Submit)
├── pengantar/               # 📄 Surat Pengantar (Generate & Approve)
├── disposisi/               # 📮 Disposisi (Assignment & Distribution)
├── leadership/              # 👔 Verifikasi Pimpinan (Approval Workflow)
├── surat-hasil/             # ✍️  Surat Hasil & Digital Signature
└── legalisasi/              # ✅ Legalisasi & Archiving
```

#### Module Structure (Setiap module memiliki struktur yang sama):

```
modules/[module-name]/
├── [module].controller.ts       # HTTP Request/Response Handler
├── [module].service.ts          # Business Logic Layer
├── [module].repository.ts       # Database Access Layer (Prisma)
├── [module].route.ts            # Route Definitions (Hono Router)
├── [module].validation.ts       # Zod Validation Schemas
└── [module].types.ts            # Module-specific TypeScript Types
```

**Example: Submission Module**
```
modules/submission/
├── submission.controller.ts     # Handle HTTP: GET, POST, PUT, DELETE
├── submission.service.ts        # Business logic: validation, workflow
├── submission.repository.ts     # Prisma queries: findMany, create, update
├── submission.route.ts          # Routes: /api/submission/*
├── submission.validation.ts     # Zod schemas: createSubmissionSchema
└── submission.types.ts          # Types: CreateSubmissionDTO, SubmissionResponse
```

---

### 📊 Layered Architecture Pattern (Controller → Service → Repository)

Setiap module mengikuti **3-layer architecture**:

```
┌─────────────────────────────────────────┐
│  HTTP Request (Client)                  │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  🎯 CONTROLLER LAYER                    │
│  - Parse request (params, query, body)  │
│  - Validate input (Zod)                 │
│  - Call service layer                   │
│  - Format response                      │
│  - Handle HTTP errors                   │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  💼 SERVICE LAYER                       │
│  - Business logic                       │
│  - Workflow orchestration               │
│  - Complex validations                  │
│  - Call multiple repositories           │
│  - External service calls               │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  🗄️  REPOSITORY LAYER                   │
│  - Database queries (Prisma)            │
│  - Data access only                     │
│  - NO business logic                    │
│  - Return plain data                    │
└─────────────────┬───────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│  Database (PostgreSQL)                  │
└─────────────────────────────────────────┘
```

---

#### 1️⃣ Controller Layer (`*.controller.ts`)

**Responsibility**: Handle HTTP request/response

```typescript
// submission.controller.ts
export class SubmissionController {
  constructor(private submissionService: SubmissionService) {}

  // GET /api/submission
  async list(c: Context) {
    try {
      const userId = c.get('userId'); // From auth middleware
      const { page, limit } = c.req.query();
      
      const result = await this.submissionService.listSubmissions(
        userId,
        { page: Number(page), limit: Number(limit) }
      );
      
      return c.json({ success: true, data: result });
    } catch (error) {
      return c.json({ success: false, error: error.message }, 500);
    }
  }

  // POST /api/submission
  async create(c: Context) {
    try {
      const body = await c.req.json();
      
      // Validate using Zod
      const validated = createSubmissionSchema.parse(body);
      
      const submission = await this.submissionService.createSubmission(
        c.get('userId'),
        validated
      );
      
      return c.json({ success: true, data: submission }, 201);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json({ success: false, errors: error.errors }, 400);
      }
      return c.json({ success: false, error: error.message }, 500);
    }
  }
}
```

**Rules:**
- ✅ Handle HTTP concerns (request parsing, response formatting)
- ✅ Input validation (Zod schemas)
- ✅ Error handling & status codes
- ❌ NO business logic (delegate to service)
- ❌ NO direct database access (use service)

---

#### 2️⃣ Service Layer (`*.service.ts`)

**Responsibility**: Business logic & workflow orchestration

```typescript
// submission.service.ts
export class SubmissionService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private notificationService: NotificationService
  ) {}

  async createSubmission(userId: string, data: CreateSubmissionDTO) {
    // Business validation
    if (data.type === 'SK' && !data.signatories) {
      throw new Error('SK requires signatories');
    }

    // Workflow: Create submission
    const submission = await this.submissionRepo.create({
      ...data,
      userId,
      status: 'DRAFT',
      submittedAt: null,
    });

    // Workflow: Send notification
    await this.notificationService.notifyNewSubmission(submission);

    return submission;
  }

  async submitForApproval(submissionId: string, userId: string) {
    // Get submission
    const submission = await this.submissionRepo.findById(submissionId);

    // Business logic: Check ownership
    if (submission.userId !== userId) {
      throw new Error('Unauthorized');
    }

    // Business logic: Check status
    if (submission.status !== 'DRAFT') {
      throw new Error('Can only submit drafts');
    }

    // Update status
    const updated = await this.submissionRepo.update(submissionId, {
      status: 'PENDING_REVIEW',
      submittedAt: new Date(),
    });

    // Trigger workflow
    await this.notificationService.notifyReviewers(updated);

    return updated;
  }
}
```

**Rules:**
- ✅ Implement business logic & validation
- ✅ Orchestrate workflow (call multiple repos/services)
- ✅ Complex data transformations
- ✅ External service integrations (email, storage, etc)
- ❌ NO HTTP concerns (request/response handling)
- ❌ NO direct SQL (use repository)

---

#### 3️⃣ Repository Layer (`*.repository.ts`)

**Responsibility**: Database access only (Prisma queries)

```typescript
// submission.repository.ts
export class SubmissionRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string) {
    return this.prisma.submission.findUnique({
      where: { id },
      include: {
        user: true,
        attachments: true,
      },
    });
  }

  async findMany(filters: SubmissionFilters) {
    return this.prisma.submission.findMany({
      where: {
        userId: filters.userId,
        status: filters.status,
      },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: CreateSubmissionData) {
    return this.prisma.submission.create({
      data,
    });
  }

  async update(id: string, data: UpdateSubmissionData) {
    return this.prisma.submission.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.prisma.submission.delete({
      where: { id },
    });
  }
}
```

**Rules:**
- ✅ Prisma queries only
- ✅ CRUD operations
- ✅ Data filtering & pagination
- ✅ Return plain data (Prisma types)
- ❌ NO business logic (validation, workflow, etc)
- ❌ NO external service calls
- ❌ Keep methods simple & focused

---

#### 4️⃣ Route Definition (`*.route.ts`)

**Responsibility**: Define HTTP routes & connect to controllers

```typescript
// submission.route.ts
import { Hono } from 'hono';
import { authMiddleware } from '@/middlewares/auth';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';
import { SubmissionRepository } from './submission.repository';
import { prisma } from '@/db';

const submissionRouter = new Hono();

// Initialize layers
const repository = new SubmissionRepository(prisma);
const service = new SubmissionService(repository);
const controller = new SubmissionController(service);

// Public routes (no auth)
submissionRouter.get('/types', (c) => controller.getTypes(c));

// Protected routes (require JWT)
submissionRouter.use('/*', authMiddleware);

submissionRouter.get('/', (c) => controller.list(c));
submissionRouter.post('/', (c) => controller.create(c));
submissionRouter.get('/:id', (c) => controller.getById(c));
submissionRouter.put('/:id', (c) => controller.update(c));
submissionRouter.delete('/:id', (c) => controller.delete(c));
submissionRouter.post('/:id/submit', (c) => controller.submit(c));

export default submissionRouter;
```

**Rules:**
- ✅ Define routes & HTTP methods
- ✅ Apply middleware (auth, validation, etc)
- ✅ Connect routes to controller methods
- ✅ Dependency injection (pass dependencies to constructors)
- ❌ NO business logic in routes

---

#### 5️⃣ Validation Schema (`*.validation.ts`)

**Responsibility**: Define Zod schemas for input validation

```typescript
// submission.validation.ts
import { z } from 'zod';

export const createSubmissionSchema = z.object({
  title: z.string().min(5).max(200),
  type: z.enum(['SK', 'ST']),
  description: z.string().optional(),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  signatories: z.array(z.string().uuid()).optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    size: z.number(),
  })).optional(),
});

export const updateSubmissionSchema = createSubmissionSchema.partial();

export const submitSubmissionSchema = z.object({
  comments: z.string().optional(),
});

export type CreateSubmissionDTO = z.infer<typeof createSubmissionSchema>;
export type UpdateSubmissionDTO = z.infer<typeof updateSubmissionSchema>;
```

**Rules:**
- ✅ Zod schemas for all input validation
- ✅ Export TypeScript types using `z.infer<>`
- ✅ Reusable schemas (e.g., `.partial()` for updates)
- ✅ Custom error messages if needed

---

#### 6️⃣ Types Definition (`*.types.ts`)

**Responsibility**: Module-specific TypeScript types

```typescript
// submission.types.ts
import { Submission, User, Attachment } from '@prisma/client';

// API Response types
export interface SubmissionResponse extends Submission {
  user: Pick<User, 'id' | 'name' | 'email'>;
  attachments: Attachment[];
}

export interface SubmissionListResponse {
  data: SubmissionResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Filter types
export interface SubmissionFilters {
  userId?: string;
  status?: string;
  type?: string;
  page: number;
  limit: number;
}

// Internal types
export interface CreateSubmissionData {
  title: string;
  type: string;
  userId: string;
  status: string;
  // ...
}
```

**Rules:**
- ✅ Types specific to this module
- ✅ API request/response types
- ✅ Extend Prisma types if needed
- ❌ Don't duplicate shared types (use from `src/shared/types/`)

---

### 🔗 How Layers Work Together (Example Flow)

**Scenario**: User creates a new submission

```
1. HTTP POST /api/submission
   Body: { title: "...", type: "SK", ... }

2. 🎯 Controller (submission.controller.ts)
   → Parse request body
   → Validate with Zod schema
   → Extract userId from JWT token
   → Call: submissionService.createSubmission(userId, data)

3. 💼 Service (submission.service.ts)
   → Business validation (e.g., SK requires signatories)
   → Call: submissionRepo.create({ ...data, userId, status: 'DRAFT' })
   → Call: notificationService.notifyNewSubmission(submission)
   → Return submission object

4. 🗄️  Repository (submission.repository.ts)
   → Execute: prisma.submission.create({ data })
   → Return created submission

5. 🎯 Controller (back to step 2)
   → Format response: { success: true, data: submission }
   → Return HTTP 201 Created

6. HTTP Response to Client
   { "success": true, "data": { "id": "...", ... } }
```

---

## 📚 API Documentation

### Base URL

```
http://localhost:3001
```

### Authentication

Semua protected routes memerlukan **JWT Token** di header:

```bash
Authorization: Bearer <your-jwt-token>
```

### API Endpoints Overview

#### 🔓 Public Routes (No Auth Required)

```
POST   /public/register              # Register user baru
POST   /public/sign-in               # Login & get JWT token
GET    /public/auth/sso/callback     # SSO authentication callback
```

#### 🔐 Protected Routes (JWT Required)

**Submission Management** (`/api/submission`)
```
GET    /api/submission               # List all submissions (with filters)
POST   /api/submission               # Create new submission
GET    /api/submission/:id           # Get submission detail
PUT    /api/submission/:id           # Update submission
DELETE /api/submission/:id           # Delete submission
POST   /api/submission/:id/submit    # Submit for approval
```

**Pengantar (Cover Letter)** (`/api/pengantar`)
```
GET    /api/pengantar                # List all pengantar
GET    /api/pengantar/:id            # Get pengantar detail
POST   /api/pengantar/:submissionId/generate    # Generate pengantar
POST   /api/pengantar/:id/approve    # Approve pengantar
POST   /api/pengantar/:id/reject     # Reject pengantar
```

**Disposisi (Distribution)** (`/api/disposisi`)
```
GET    /api/disposisi                # List all disposisi
GET    /api/disposisi/:id            # Get disposisi detail
POST   /api/disposisi                # Create new disposisi
POST   /api/disposisi/:id/process    # Process disposisi
```

**Leadership Approval** (`/api/leadership`)
```
GET    /api/leadership/pending       # Get pending approvals
POST   /api/leadership/:submissionId/approve    # Approve submission
POST   /api/leadership/:submissionId/reject     # Reject submission
POST   /api/leadership/:submissionId/redispose  # Redispose submission
```

**Surat Hasil & Signature** (`/api/surat-hasil`)
```
GET    /api/surat-hasil              # List all surat hasil
GET    /api/surat-hasil/:id          # Get surat hasil detail
GET    /api/surat-hasil/:id/signatures    # Get signature queue
POST   /api/surat-hasil/:submissionId/generate    # Generate surat hasil
POST   /api/surat-hasil/:id/sign     # Digital signature
```

**Legalisasi & Archive** (`/api/legalisasi`)
```
GET    /api/legalisasi/pending       # List pending legalisasi
GET    /api/legalisasi/archive       # Get archived documents
GET    /api/legalisasi/:id           # Get legalisasi detail
POST   /api/legalisasi/:suratHasilId/process     # Process legalisasi
POST   /api/legalisasi/:id/distribute             # Distribute document
```

**Master Data** (`/api/master`)
```
# Users
GET    /api/master/user              # List users
POST   /api/master/user              # Create user
GET    /api/master/user/:id          # Get user detail
PUT    /api/master/user/:id          # Update user
DELETE /api/master/user/:id          # Delete user

# Roles & Permissions
GET    /api/master/role              # List roles
POST   /api/master/role              # Create role
GET    /api/master/permission        # List permissions
POST   /api/master/permission        # Create permission

# Departments & Study Programs
GET    /api/master/departemen        # List departments
POST   /api/master/departemen        # Create department
GET    /api/master/prodi             # List study programs
POST   /api/master/prodi             # Create study program

# Students & Staff
GET    /api/master/mahasiswa         # List students
POST   /api/master/mahasiswa         # Create student
GET    /api/master/pegawai           # List staff/employees
POST   /api/master/pegawai           # Create staff

# Document Templates
GET    /api/master/surat-type        # List document types
POST   /api/master/surat-type        # Create document type
GET    /api/master/surat-template    # List document templates
POST   /api/master/surat-template    # Create template
```

**Current User** (`/api/me`)
```
GET    /api/me                       # Get current user profile
PUT    /api/me                       # Update profile
GET    /api/me/submissions           # Get my submissions
GET    /api/me/notifications         # Get my notifications
```

**Dashboard** (`/api/dash`)
```
GET    /api/dash/stats               # Get dashboard statistics
GET    /api/dash/recent-activity     # Get recent activities
GET    /api/dash/charts              # Get chart data
```

---

### Example API Usage

#### 1. Login

```bash
curl -X POST http://localhost:3001/public/sign-in \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "name": "Admin User",
      "email": "admin@example.com",
      "role": "ADMIN"
    }
  }
}
```

---

#### 2. Create Submission

```bash
curl -X POST http://localhost:3001/api/submission \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Surat Keputusan Pengangkatan Dosen",
    "type": "SK",
    "description": "SK untuk pengangkatan dosen baru",
    "urgency": "HIGH",
    "signatories": ["uuid-1", "uuid-2"]
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "submission-uuid",
    "title": "Surat Keputusan Pengangkatan Dosen",
    "type": "SK",
    "status": "DRAFT",
    "createdAt": "2026-01-19T10:00:00Z"
  }
}
```

---

#### 3. List Submissions with Filters

```bash
curl -X GET "http://localhost:3001/api/submission?status=PENDING&page=1&limit=10" \
  -H "Authorization: Bearer <your-jwt-token>"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "title": "...",
      "status": "PENDING"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

---

### API Response Format (Standardized)

**Success Response:**
```json
{
  "success": true,
  "data": { /* ... response data ... */ }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { /* optional additional details */ }
}
```

**Validation Error Response:**
```json
{
  "success": false,
  "error": "Validation failed",
  "errors": [
    {
      "field": "title",
      "message": "Title must be at least 5 characters"
    }
  ]
}
```

---

### HTTP Status Codes

```
200 OK                  - Successful GET, PUT, DELETE
201 Created             - Successful POST (resource created)
400 Bad Request         - Invalid input / validation error
401 Unauthorized        - Missing or invalid JWT token
403 Forbidden           - Not enough permissions (RBAC)
404 Not Found           - Resource not found
409 Conflict            - Resource conflict (e.g., duplicate email)
422 Unprocessable       - Business logic validation failed
500 Internal Error      - Server error
```

---

## 🎯 Development Conventions

### File Naming Conventions

```bash
✅ kebab-case for files:          submission.controller.ts, user.service.ts
✅ PascalCase for classes:         SubmissionController, UserService
✅ camelCase for functions:        getUserById, createSubmission
✅ UPPER_SNAKE_CASE for constants: JWT_SECRET, MAX_FILE_SIZE
```

---

### Module Structure Convention

**SEMUA module HARUS memiliki 6 files ini:**

```
modules/[module-name]/
├── [module].controller.ts       # ✅ Required
├── [module].service.ts          # ✅ Required
├── [module].repository.ts       # ✅ Required
├── [module].route.ts            # ✅ Required
├── [module].validation.ts       # ✅ Required
└── [module].types.ts            # ✅ Required
```

**Example untuk module baru `notification`:**
```
modules/notification/
├── notification.controller.ts
├── notification.service.ts
├── notification.repository.ts
├── notification.route.ts
├── notification.validation.ts
└── notification.types.ts
```

---

### Dependency Injection Pattern

**SELALU gunakan constructor injection:**

```typescript
// ✅ GOOD: Constructor injection
export class SubmissionController {
  constructor(
    private submissionService: SubmissionService
  ) {}
}

export class SubmissionService {
  constructor(
    private submissionRepo: SubmissionRepository,
    private notificationService: NotificationService
  ) {}
}

// ❌ BAD: Direct instantiation
export class SubmissionController {
  private submissionService = new SubmissionService(); // Don't do this!
}
```

---

### Error Handling Convention

**Use custom error classes:**

```typescript
// shared/utils/errors.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

// Usage in service:
if (!user) {
  throw new UnauthorizedError('Invalid credentials');
}
```

---

### Database Query Convention

**Prisma queries di repository layer ONLY:**

```typescript
// ✅ GOOD: Query in repository
// submission.repository.ts
async findById(id: string) {
  return this.prisma.submission.findUnique({
    where: { id },
    include: { user: true },
  });
}

// submission.service.ts
async getSubmission(id: string) {
  const submission = await this.submissionRepo.findById(id);
  // ... business logic
  return submission;
}

// ❌ BAD: Direct Prisma query in service
// submission.service.ts
async getSubmission(id: string) {
  const submission = await prisma.submission.findUnique({ // Don't do this!
    where: { id },
  });
}
```

---

### Validation Convention

**Use Zod for all input validation:**

```typescript
// validation.ts
export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'USER', 'OPERATOR']),
});

// controller.ts
async create(c: Context) {
  const body = await c.req.json();
  
  try {
    const validated = createUserSchema.parse(body);
    // ... proceed with validated data
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, errors: error.errors }, 400);
    }
  }
}
```

---

### Async/Await Convention

**ALWAYS use async/await, NEVER use .then()/.catch():**

```typescript
// ✅ GOOD: async/await
async function getUser(id: string) {
  try {
    const user = await userRepo.findById(id);
    return user;
  } catch (error) {
    throw new AppError('User not found');
  }
}

// ❌ BAD: .then()/.catch()
function getUser(id: string) {
  return userRepo.findById(id)
    .then(user => user)
    .catch(error => {
      throw new AppError('User not found');
    });
}
```

---

## ✅ Best Practices

### 1. Database & Prisma

```bash
✅ Always run `bunx prisma generate` after schema changes
✅ Use migrations for all schema changes (don't use `db push` in production)
✅ Name migrations descriptively: `bunx prisma migrate dev --name add_user_avatar`
✅ Use Prisma relations instead of manual JOINs
✅ Use transactions for multi-table operations
❌ Never modify migration files after they're applied
❌ Don't use `prisma db push` in production (only for prototyping)
```

---

### 2. Security

```bash
✅ Validate ALL user inputs with Zod
✅ Use JWT for authentication
✅ Implement RBAC with Casbin for authorization
✅ Hash passwords with bcrypt (min 10 rounds)
✅ Use environment variables for secrets (never hardcode)
✅ Sanitize file uploads
✅ Implement rate limiting on public routes
❌ Never expose sensitive data in error messages
❌ Never commit .env files
❌ Don't trust client-side validation alone
```

---

### 3. Code Organization

```bash
✅ Follow Controller → Service → Repository pattern strictly
✅ One responsibility per file
✅ Keep functions small (<50 lines ideal)
✅ Use descriptive variable names (avoid abbreviations)
✅ Add JSDoc comments for complex logic
❌ No business logic in controllers
❌ No HTTP concerns in services
❌ No SQL queries in services (use repository)
❌ Don't put everything in shared folder
```

---

### 4. Error Handling

```bash
✅ Use try/catch in controllers
✅ Throw custom errors in services (AppError, ValidationError, etc)
✅ Return consistent error response format
✅ Log errors with context (user ID, request ID, etc)
❌ Don't swallow errors silently
❌ Don't expose stack traces to clients in production
```

---

### 5. Performance

```bash
✅ Use Prisma `select` to fetch only needed fields
✅ Use `include` wisely (avoid over-fetching relations)
✅ Implement pagination for list endpoints
✅ Add database indexes for frequently queried fields
✅ Use caching for static/rarely-changed data
❌ Don't fetch all records without limit
❌ Avoid N+1 query problems (use `include` or separate queries)
```

---

### 6. Testing

```bash
✅ Write tests for business logic (service layer)
✅ Use meaningful test descriptions
✅ Test error cases, not just happy paths
✅ Mock external dependencies
✅ Use test database (separate from development)
❌ Don't skip tests for critical features
```

---

### 7. Git Workflow

```bash
✅ Use meaningful commit messages: "feat: add submission approval flow"
✅ Keep commits atomic (one feature/fix per commit)
✅ Branch naming: feature/add-notifications, fix/submission-validation
✅ Pull before push to avoid conflicts
❌ Don't commit commented-out code
❌ Don't commit debug console.logs
❌ Never commit .env files
```

---

### 8. Documentation

```bash
✅ Update README when adding new features
✅ Add JSDoc comments for complex functions
✅ Document API endpoints (consider Swagger/OpenAPI)
✅ Keep .env.example up to date
❌ Don't leave TODO comments forever (fix or create issue)
```

---

## 🧪 Testing

### Run Tests

```bash
# Run all tests
bun test

# Run tests with coverage
bun test --coverage

# Run specific test file
bun test submission.test.ts

# Watch mode
bun test --watch
```

---

## 🚀 Production Deployment

### Build & Deploy with Docker

```bash
# Build production image
docker build -t e-office-api:latest .

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f api
```

### Manual Deployment

```bash
# Install production dependencies only
bun install --production

# Generate Prisma Client
bunx prisma generate

# Run migrations
bunx prisma migrate deploy

# Start production server
NODE_ENV=production bun start
```

---

## 🔧 Troubleshooting

### Common Issues

**1. Database Connection Error**
```
Error: P1001: Can't reach database server
```
**Solution:**
```bash
# Check if Docker is running
docker ps

# Restart database
docker-compose -f docker-compose.dev.yml restart postgres
```

---

**2. Prisma Client Not Generated**
```
Error: @prisma/client did not initialize yet
```
**Solution:**
```bash
bunx prisma generate
```

---

**3. Migration Failed**
```
Error: P3009: Failed to apply migration
```
**Solution:**
```bash
# Reset database (⚠️ DEVELOPMENT ONLY!)
bunx prisma migrate reset

# Or check migration status
bunx prisma migrate status
```

---

**4. Port Already in Use**
```
Error: EADDRINUSE: address already in use :::3001
```
**Solution:**
```bash
# Find process using port 3001
lsof -i :3001         # Mac/Linux
netstat -ano | findstr :3001    # Windows

# Kill process
kill -9 <PID>         # Mac/Linux
taskkill /PID <PID> /F    # Windows

# Or change PORT in .env
PORT=3002
```

---

**5. JWT Token Invalid**
```
Error: JsonWebTokenError: invalid signature
```
**Solution:**
- Pastikan `JWT_SECRET` di `.env` sama dengan yang digunakan saat generate token
- Jangan ubah `JWT_SECRET` di production tanpa re-issue semua tokens

---

## 📚 Additional Resources

- [Hono Documentation](https://hono.dev/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Bun Documentation](https://bun.sh/docs)
- [Casbin Documentation](https://casbin.org/docs/overview)
- [Zod Documentation](https://zod.dev/)

---

## 🤝 Contributing

1. Fork repository
2. Create feature branch: `git checkout -b feature/your-feature`
3. Make changes following conventions
4. Test thoroughly
5. Commit: `git commit -m "feat: add your feature"`
6. Push: `git push origin feature/your-feature`
7. Create Pull Request

---

## 📝 License

Private - E-Office Development Team

---

**Happy Coding! 🚀**

Built with ❤️ using Hono, Prisma, and Bun.