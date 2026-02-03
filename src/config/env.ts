/**
 * Environment Configuration
 * Load & validasi environment variables
 */

import { z } from 'zod';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

const myEnv = dotenv.config();
dotenvExpand.expand(myEnv);

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3079'),
  BASE_URL: z.string().default('http://localhost:3079'),
  
  // Database
  DATABASE_URL: z.string(),
  
  // JWT & Security
  JWT_SECRET: z.string(),
  DEFAULT_PASSWORD: z.string().default('pagidatangsorehilang'),
  AVATAR_DEFAULT: z.string().default('https://gw.alipayobjects.com/zos/rmsportal/BiazfanxmamNRoxxVxka.png'),
  SSO_URL: z.string().optional(),
  
  // MinIO / Storage
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.string().default('9000'),
  MINIO_ACCESS_KEY: z.string().default('minioadmin'),
  MINIO_SECRET_KEY: z.string().default('minioadmin'),
  MINIO_BUCKET_NAME: z.string().default('e-office-storage'),
  MINIO_REGION: z.string().default('us-east-1'),
  MINIO_USE_SSL: z.string().default('false'),
  MINIO_SERVER_URL: z.string().optional(),
  MINIO_FOLDER_LAMPIRAN: z.string().default('lampiran'),
  MINIO_FOLDER_SIGNATURE: z.string().default('signature'),
  MINIO_EXPIRY_URL: z.string().default('604800'),

  // Encryption & Verification (untuk QR Code legalisasi)
  APP_KEY: z.string().min(32, 'APP_KEY harus minimal 32 karakter untuk keamanan'),
  // VERIFICATION_BASE_URL bisa berupa URL lengkap atau menggunakan HOST_IP
  VERIFICATION_BASE_URL: z.string().default('http://localhost:3000'),
  // HOST_IP untuk network access (HP yang satu jaringan)
  HOST_IP: z.string().default('localhost'),
  // Port Frontend untuk verifikasi QR
  FRONTEND_PORT: z.string().default('3000'),

  // Email (Optional)
  MAIL_ENABLED: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
