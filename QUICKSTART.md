# 🚀 Quick Start Guide - E-Office API v2

Panduan cepat untuk memulai development E-Office API.

## ⚡ Setup dalam 5 Menit

### 1. Install Dependencies

```bash
bun install
# atau: npm install
```

### 2. Install Dependencies Tambahan untuk Hono

```bash
bun add hono @hono/node-server jsonwebtoken bcryptjs
bun add -d @types/jsonwebtoken @types/bcryptjs
```

### 3. Setup Environment

```bash
# Copy .env.example
cp .env.example .env

# Generate JWT Secret
# Linux/Mac:
openssl rand -base64 32

# Windows PowerShell:
# [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Edit .env dan paste JWT secret
```

### 4. Start Database (Docker)

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 5. Setup Database

```bash
# Generate Prisma Client
bunx prisma generate

# Run migrations
bunx prisma migrate dev

# (Optional) Seed data
bunx prisma db seed
```

### 6. Start Server

```bash
bun dev
```

✅ Server running at `http://localhost:3000`

## 🧪 Test API

### Health Check
```bash
curl http://localhost:3000/health
```

### Register User
```bash
curl -X POST http://localhost:3000/public/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123",
    "name": "Admin User",
    "role": "Admin"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/public/sign-in \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password123"
  }'
```

Simpan JWT token dari response untuk request berikutnya.

### Get Submissions (Protected)
```bash
curl http://localhost:3000/api/submission \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

## 📊 Database Management

### Open Prisma Studio
```bash
bunx prisma studio
# Buka browser: http://localhost:5555
```

### View Database
```bash
# Connect ke PostgreSQL
docker exec -it e-office-db psql -U postgres -d e_office_db

# List tables
\dt

# Exit
\q
```

## 🛠 Common Commands

```bash
# Development
bun dev                          # Start dev server dengan hot reload

# Database
bunx prisma generate             # Generate Prisma Client
bunx prisma migrate dev          # Create & apply migration
bunx prisma migrate reset        # Reset database (WARNING: deletes data)
bunx prisma studio               # Open database GUI

# Code Quality
bun lint                         # Check code
bun lint:fix                     # Fix issues automatically

# Production
bun start                        # Start production server
```

## 🔧 Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:3000 | xargs kill -9
```

### Database Connection Error
```bash
# Check if PostgreSQL is running
docker ps

# Restart database
docker compose -f docker-compose.dev.yml restart postgres

# Check logs
docker compose -f docker-compose.dev.yml logs postgres
```

### Prisma Client Not Generated
```bash
bunx prisma generate
```

## 📱 VS Code Extensions (Recommended)

- **Prisma** - Syntax highlighting & autocomplete
- **Biome** - Linting & formatting
- **REST Client** - Test API endpoints
- **Thunder Client** - API testing
- **Error Lens** - Inline error messages

## 🎯 Next Steps

1. ✅ Setup development environment
2. 📖 Baca [API Documentation](README.md#-api-documentation)
3. 🏗️ Pelajari [Arsitektur Aplikasi](README.md#-arsitektur-aplikasi)
4. 💻 Mulai develop fitur baru di folder `src/modules/`
5. 🧪 Tulis tests untuk fitur baru
6. 📝 Update dokumentasi

## 💡 Tips

- Gunakan Prisma Studio untuk explore database
- Gunakan Thunder Client/Postman untuk test API
- Check `src/shared/constants/` untuk role & status definitions
- Setiap module punya pattern yang sama: controller → service → repository
- Semua business logic ada di service layer
- Repository hanya untuk database operations

---

Happy Coding! 🚀
