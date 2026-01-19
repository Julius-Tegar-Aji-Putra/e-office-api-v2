# 📦 Package Installation Commands

Kumpulan perintah install dependencies untuk E-Office API v2.

## 🎯 Required Dependencies

### Core Framework & Runtime

```bash
# Hono - Web Framework
bun add hono @hono/node-server

# Zod - Schema Validation
bun add zod
```

### Authentication & Security

```bash
# JWT & Password Hashing
bun add jsonwebtoken bcryptjs
bun add -d @types/jsonwebtoken @types/bcryptjs
```

### Database

```bash
# Prisma ORM (Already installed)
# If needed: bun add @prisma/client
# If needed: bun add -d prisma
```

### Utilities (Already Installed)

```bash
# Casbin - Authorization
# Already in package.json: casbin

# MinIO - Object Storage
# Already in package.json: minio

# Better Auth - Enhanced Authentication
# Already in package.json: better-auth
```

## 🔧 Optional Dependencies

### Email Sending

```bash
bun add nodemailer
bun add -d @types/nodemailer
```

### Redis Client (Caching)

```bash
bun add ioredis
bun add -d @types/ioredis
```

### Rate Limiting

```bash
bun add @hono/rate-limiter
```

### File Upload

```bash
bun add multer
bun add -d @types/multer
```

### Date/Time Utilities

```bash
bun add date-fns
# atau
bun add dayjs
```

### Logging

```bash
bun add pino
bun add pino-pretty
```

### Testing

```bash
bun add -d @types/bun
bun add -d bun-test
```

### API Documentation (Swagger/OpenAPI)

```bash
bun add @hono/swagger-ui
bun add @hono/zod-openapi
```

## 📋 Complete Installation (All at Once)

### Minimal Required

```bash
bun add hono @hono/node-server zod jsonwebtoken bcryptjs
bun add -d @types/jsonwebtoken @types/bcryptjs
```

### With Optional Features

```bash
# Add all optional dependencies
bun add nodemailer ioredis @hono/rate-limiter date-fns pino pino-pretty @hono/swagger-ui @hono/zod-openapi
bun add -d @types/nodemailer @types/ioredis
```

## 🚀 Using NPM Instead of Bun

### Required Dependencies

```bash
npm install hono @hono/node-server zod jsonwebtoken bcryptjs
npm install -D @types/jsonwebtoken @types/bcryptjs
```

### Optional Dependencies

```bash
npm install nodemailer ioredis @hono/rate-limiter date-fns pino pino-pretty
npm install -D @types/nodemailer @types/ioredis
```

## 🧶 Using Yarn

### Required Dependencies

```bash
yarn add hono @hono/node-server zod jsonwebtoken bcryptjs
yarn add -D @types/jsonwebtoken @types/bcryptjs
```

### Optional Dependencies

```bash
yarn add nodemailer ioredis @hono/rate-limiter date-fns pino pino-pretty
yarn add -D @types/nodemailer @types/ioredis
```

## 📦 Dependency Versions

Untuk memastikan compatibility, gunakan versi berikut:

```json
{
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0",
    "zod": "^4.0.0",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "@prisma/client": "^6.0.0"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.5",
    "@types/bcryptjs": "^2.4.6",
    "prisma": "^6.0.0",
    "typescript": "^5.0.0"
  }
}
```

## 🔍 Verify Installation

Check installed packages:

```bash
# Bun
bun pm ls

# NPM
npm list

# Yarn
yarn list
```

## 🧹 Clean Install

Jika ada masalah dengan dependencies:

```bash
# Remove node_modules and lock files
rm -rf node_modules
rm bun.lockb  # or rm package-lock.json or rm yarn.lock

# Reinstall
bun install
# or npm install
# or yarn install
```

## 📝 Notes

- **Bun** adalah package manager tercepat (recommended)
- **NPM** & **Yarn** juga fully supported
- Semua dependencies di `package.json` sudah terinstall kecuali Hono dan JWT
- Dependencies optional sesuai kebutuhan fitur
- Gunakan `--save-exact` untuk production builds

---

Last updated: January 2026
