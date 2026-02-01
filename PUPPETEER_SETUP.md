# Puppeteer Setup Guide

## Masalah: Chrome Browser Tidak Ditemukan

Jika muncul error seperti ini:
```
Could not find Chrome (ver. 144.0.7559.96). This can occur if either 
1. you did not perform an installation before running the script 
(e.g. `npx puppeteer browsers install chrome`) or 
2. your cache path is incorrectly configured 
(which is: ./node_modules/.puppeteer_cache).
```

## Solusi

### Opsi 1: Auto Install (Recommended)

Puppeteer Chrome browser akan **otomatis di-install** saat `bun install` karena ada **postinstall script** di `package.json`:

```json
{
  "scripts": {
    "postinstall": "bunx puppeteer browsers install chrome"
  }
}
```

**Namun**, jika Bun tidak menjalankan postinstall (karena cache), jalankan manual:

```bash
bun install
```

### Opsi 2: Manual Install

Jika Chrome belum ter-install, jalankan command berikut:

```bash
bunx puppeteer browsers install chrome
```

Atau dengan npm/npx:

```bash
npx puppeteer browsers install chrome
```

## Verifikasi Instalasi

Setelah install, Chrome browser akan berada di:
```
node_modules/.puppeteer_cache/chrome/win64-{version}/chrome-win64/chrome.exe
```

## Konfigurasi

File `.puppeteerrc.json` mengatur lokasi cache:

```json
{
  "cacheDirectory": "./node_modules/.puppeteer_cache",
  "skipDownload": false
}
```

## Setup untuk Tim/Laptop Baru

Ketika clone repository di laptop baru:

1. Clone repository
   ```bash
   git clone <repo-url>
   cd e-office-monorepo/e-office-api-v2
   ```

2. Install dependencies (Chrome akan auto-install)
   ```bash
   bun install
   ```

3. Jika Chrome belum ter-install, run manual:
   ```bash
   bunx puppeteer browsers install chrome
   ```

4. Start development server
   ```bash
   bun run dev
   ```

## Catatan Penting

- ⚠️ **Cache Puppeteer TIDAK masuk Git** (sudah ada di `.gitignore`)
- ⚠️ Setiap developer **harus install Chrome sendiri** di laptop masing-masing
- ✅ Ukuran Chrome browser ~300MB, jadi **JANGAN commit ke Git**
- ✅ Postinstall script akan **otomatis install** saat `bun install`

## Troubleshooting

### Error: Chrome Not Found (Setelah Install)

Restart terminal dan backend server:
```bash
# Stop server (Ctrl+C)
bun run dev
```

### Error: Permission Denied (Windows)

Run terminal sebagai Administrator, lalu install ulang:
```bash
bunx puppeteer browsers install chrome
```

### Error: Download Failed

Cek koneksi internet dan coba lagi dengan force:
```bash
bunx puppeteer browsers install chrome --force
```

## Referensi

- [Puppeteer Configuration](https://pptr.dev/guides/configuration)
- [Puppeteer Browser Management](https://pptr.dev/guides/browsers)
