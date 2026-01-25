# Enkripsi & Verifikasi QR Code

## Overview
Modul legalisasi menggunakan enkripsi AES untuk mengamankan data verifikasi yang disimpan di QR Code pada dokumen resmi.

## Environment Variables

### APP_KEY
**Lokasi:** `.env`  
**Format:** String minimal 32 karakter  
**Fungsi:** Kunci enkripsi AES untuk QR Code verification token

⚠️ **PENTING:**
- **JANGAN** share key ini ke publik
- **JANGAN** commit key production ke git
- **GANTI** key untuk setiap environment (dev, staging, production)

**Generate Key Baru:**
```bash
# Menggunakan Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64').slice(0,32))"

# Menggunakan OpenSSL
openssl rand -base64 32 | cut -c1-32
```

### VERIFICATION_BASE_URL
**Lokasi:** `.env`  
**Format:** URL lengkap (https://...)  
**Fungsi:** Base URL untuk link verifikasi QR Code

**Contoh:**
```env
# Development
VERIFICATION_BASE_URL="http://localhost:3079"

# Production
VERIFICATION_BASE_URL="https://e-office.undip.ac.id"
```

## Cara Kerja

### 1. Enkripsi (Generate QR Code)
```
Document Data → JSON → AES Encrypt → URL-safe Base64 → QR Code
```

File: `src/shared/utils/encryption.ts`
- Fungsi `encryptVerificationData()` menggunakan `env.APP_KEY`
- Output: Encrypted token yang aman untuk QR Code

### 2. Dekripsi (Scan QR Code)
```
QR Code → URL-safe Base64 → AES Decrypt → JSON → Document Data
```

File: `src/routes/public/verification.ts`
- Endpoint: `GET /verification/verify?token=...`
- Public endpoint (tidak perlu autentikasi)
- Menggunakan `env.APP_KEY` yang sama untuk dekripsi

## Payload QR Code

```typescript
interface VerificationPayload {
  id: string;           // Document ID
  no: string;           // Nomor Surat
  ttd: string;          // Nama penandatangan
  tgl: string;          // Tanggal surat
  jenis: string;        // Jenis surat (SK/ST)
  perihal?: string;     // Perihal
  timestamp: number;    // Timestamp enkripsi
}
```

## Security Notes

1. **Key Rotation**: Ganti APP_KEY secara berkala untuk keamanan
2. **HTTPS Only**: Gunakan HTTPS di production untuk VERIFICATION_BASE_URL
3. **Token Lifetime**: QR Code valid selama 10 tahun (konfigurasi di `isTokenValid()`)
4. **No Personal Data**: QR Code hanya berisi informasi dokumen publik

## Testing

```bash
# Login sebagai UPA
curl -c cookies.txt -X POST http://localhost:3079/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"upa@fsm.undip.ac.id","password":"password1234"}'

# Generate QR Code
curl -b cookies.txt -X POST http://localhost:3079/api/legalisasi/document/{id}/generate-qr

# Verifikasi (public, no auth)
curl http://localhost:3079/verification/verify?token={encrypted_token}
```

## Troubleshooting

### Error: "APP_KEY harus minimal 32 karakter"
- Pastikan APP_KEY di `.env` memiliki minimal 32 karakter
- Check dengan: `echo $APP_KEY | wc -c`

### Error: "Invalid token - decryption failed"
- APP_KEY berbeda antara enkripsi dan dekripsi
- Token corrupt atau modified
- Pastikan menggunakan `.env` yang sama

### QR Code tidak terbaca
- Pastikan VERIFICATION_BASE_URL benar
- Check network connectivity
- Pastikan token tidak terpotong saat di-copy
