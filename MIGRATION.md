# Migration Guide - Elysia to Hono

## Status: Routes lama belum dimigrasi

File routes di folder `src/routes/` masih menggunakan **Elysia framework**, sedangkan struktur baru menggunakan **Hono framework**.

## Routes yang Perlu Dimigrasi:

### Public Routes
- ❌ `src/routes/public/register.ts` → Perlu migrasi ke Hono
- ❌ `src/routes/public/sign-in.ts` → Perlu migrasi ke Hono  
- ❌ `src/routes/public/auth/sso/callback.ts` → Perlu migrasi ke Hono

### Dashboard & User Routes
- ❌ `src/routes/dash.ts` → Perlu migrasi ke Hono
- ❌ `src/routes/me.ts` → Perlu migrasi ke Hono

### Master Data Routes
- ❌ `src/routes/master/departemen.ts` → Perlu migrasi ke Hono
- ❌ `src/routes/master/mahasiswa.ts` → Perlu migrasi ke Hono
- ❌ `src/routes/master/pegawai.ts` → Perlu migrasi ke Hono
- ❌ `src/routes/master/permission.ts` → Perlu migrasi ke Hono
- ❌ `src/routes/master/prodi.ts` → Perlu migrasi ke Hono
- ❌ `src/routes/master/role.ts` → Perlu migrasi ke Hono
- ❌ `src/routes/master/suratTemplate.ts` → Perlu migrasi ke Hono
- ❌ `src/routes/master/suratType.ts` → Perlu migrasi ke Hono
- ❌ `src/routes/master/user.ts` → Perlu migrasi ke Hono

## Langkah Migrasi:

### 1. Contoh Migrasi Route (Register)

**Before (Elysia):**
```typescript
import Elysia, { t } from 'elysia';

export default new Elysia()
  .post('/register', async ({ body }) => {
    // logic here
    return { success: true, data };
  }, {
    body: t.Object({
      name: t.String(),
      email: t.String(),
      password: t.String()
    })
  });
```

**After (Hono):**
```typescript
import { Hono } from 'hono';
import { z } from 'zod';

const registerRoutes = new Hono();

// Validation schema
const registerSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string().min(8)
});

registerRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const validated = registerSchema.parse(body);
  
  // logic here
  
  return c.json({ success: true, data });
});

export { registerRoutes };
```

### 2. Struktur Modular (Rekomendasi)

Untuk master data routes, ikuti struktur modular seperti modules yang sudah dibuat:

```
src/modules/auth/
  ├── auth.controller.ts
  ├── auth.service.ts
  ├── auth.repository.ts
  ├── auth.route.ts
  ├── auth.validation.ts
  └── auth.types.ts
```

### 3. Update Routes Registry

Setelah migrasi, uncomment di `src/routes.ts`:

```typescript
// Uncomment setelah migrasi selesai
import { authRoutes } from './modules/auth/auth.route';

app.route('/public/register', authRoutes);
```

## Prioritas Migrasi:

1. **High Priority** - Authentication & User
   - register, sign-in, me
   
2. **Medium Priority** - Master Data
   - user, role, permission
   
3. **Low Priority** - Supporting Data
   - departemen, prodi, mahasiswa, pegawai, surat-type, surat-template

## Tools & Resources:

- [Hono Documentation](https://hono.dev/)
- [Zod Documentation](https://zod.dev/)
- Contoh: Lihat file di `src/modules/submission/`

## Notes:

- Semua routes lama sementara di-comment untuk menghindari TypeScript errors
- New modular routes sudah berfungsi dengan Hono
- Migrasi bisa dilakukan bertahap sesuai prioritas
