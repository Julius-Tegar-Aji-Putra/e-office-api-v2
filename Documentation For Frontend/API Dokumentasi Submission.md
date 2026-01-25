# 📝 Dokumentasi API Submission - E-Office ST/SK Dekan

## 🎯 Overview
Modul Submission menangani pengajuan surat baru oleh Mahasiswa dan Dosen. Menyediakan endpoint untuk membuat, melihat, mengubah, membatalkan pengajuan, serta mengelola lampiran dokumen pendukung.

## 🌐 Base URL
- **Local:** http://localhost:3079
- **Network:** http://192.168.18.36:3079

## 🔐 Authentication
- Endpoint `/letter-types` dan `/letter-types/:id` → **PUBLIC** (tidak perlu login)
- Endpoint lainnya → **PRIVATE** (perlu login sebagai MAHASISWA atau DOSEN)
- Cookie: `better-auth.session_token` harus terkirim

⚠️ **IMPORTANT:** Setelah login, wajib panggil `GET /me` untuk mendapatkan informasi user lengkap termasuk role.

---

## 📋 Field Structure (REVISED)

### Data Diri
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `nama` | string | ✅ | Nama Lengkap (min 2 karakter) |
| `nim` | string | ❌ | NIM (khusus Mahasiswa) |
| `nip` | string | ❌ | NIP (khusus Dosen) |
| `departemen` | string | ✅ | Departemen (min 1 karakter) |
| `programStudi` | string | ✅ | Program Studi (min 1 karakter) |
| `butuhTtdKadep` | boolean | ❌ | Butuh TTD Kadep di Surat Pengantar? (default: false) |

### Kebutuhan Surat
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jenisSurat` | enum | ✅ | SURAT_TUGAS \| SURAT_KEPUTUSAN |
| `keperluan` | string | ✅ | Keperluan (min 10 karakter) |
| `judulAcara` | string | ✅ | Nama Acara (min 5 karakter) |
| `tanggalAcara` | datetime | ✅ | Tanggal Acara - **date & time** (ISO format: 2026-02-15T09:00:00Z) |
| `durasiAcara` | string | ❌ | Durasi Acara (contoh: "3 hari") |
| `lokasiAcara` | string | ✅ | Lokasi Acara (min 3 karakter) |

### Lampiran
- **Format:** PDF/JPG/PNG
- **Max files:** 5 files
- **Max size per file:** 5MB

### Signature Config
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetSigner` | enum | ✅ | DEKAN \| WADEK_1 \| WADEK_2 |
| `requestKadepSign` | boolean | ❌ | Butuh TTD Kadep di surat pengantar? (default: false) |

---

## 📍 API Endpoints

### 1. Get Letter Types (PUBLIC)
Mendapatkan daftar semua jenis surat yang tersedia untuk pengajuan.

**Endpoint:** `GET /api/submission/letter-types`

**Request Example:**
```bash
curl -X GET "http://localhost:3079/api/submission/letter-types"
```

**Response Success (200):**
```json
{
  "success": true,
  "data": {
    "letterTypes": [
      {
        "id": "cmktblwa50043o9rcfmw92xth",
        "name": "Surat Tugas",
        "code": "ST",
        "description": "Surat tugas untuk kegiatan akademik",
        "category": "UMUM",
        "requiresPengantar": true,
        "requiresDekanSign": true,
        "requiresWadekSign": false,
        "defaultTargetSigner": "DEKAN",
        "createdAt": "2026-01-24T08:00:00.000Z",
        "updatedAt": "2026-01-24T08:00:00.000Z"
      }
    ]
  }
}
```

---

### 2. Get Letter Type Detail with Schema (PUBLIC)
Mendapatkan detail jenis surat beserta schema form untuk frontend.

**Endpoint:** `GET /api/submission/letter-types/:id`

**Request Example:**
```bash
curl -X GET "http://localhost:3079/api/submission/letter-types/cmktblwa50043o9rcfmw92xth"
```

**Response Success (200):**
```json
{
  "success": true,
  "data": {
    "letterType": {
      "id": "cmktblwa50043o9rcfmw92xth",
      "name": "Surat Tugas",
      "code": "ST",
      "category": "UMUM"
    },
    "template": {
      "id": "template123",
      "versionName": "v1.0",
      "schemaDefinition": {
        "type": "object",
        "required": ["nama", "departemen", "programStudi", "jenisSurat", "keperluan", "judulAcara", "tanggalAcara", "lokasiAcara"],
        "properties": {
          "nama": { "type": "string", "minLength": 2 },
          "nim": { "type": "string" },
          "nip": { "type": "string" },
          "departemen": { "type": "string", "minLength": 1 },
          "programStudi": { "type": "string", "minLength": 1 },
          "jenisSurat": { "type": "string", "enum": ["SURAT_TUGAS", "SURAT_KEPUTUSAN"] },
          "keperluan": { "type": "string", "minLength": 10 },
          "judulAcara": { "type": "string", "minLength": 5 },
          "tanggalAcara": { "type": "string", "format": "date-time" },
          "durasiAcara": { "type": "string" },
          "lokasiAcara": { "type": "string", "minLength": 3 },
          "butuhTtdKadep": { "type": "boolean", "default": false }
        }
      }
    }
  }
}
```

---

### 3. Get My Submissions (PRIVATE)
Mendapatkan daftar semua pengajuan surat user yang sedang login.

**Endpoint:** `GET /api/submission`

**Query Parameters (All Optional):**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Items per page (max: 100) |
| `status` | string | - | Filter by status |
| `letterTypeId` | string | - | Filter by letter type |
| `category` | enum | - | AKADEMIK \| SUMBER_DAYA \| UMUM |
| `search` | string | - | Search in keperluan, judulAcara |
| `dateFrom` | string | - | Filter from date |
| `dateTo` | string | - | Filter to date |
| `sortBy` | enum | - | submittedAt \| status \| judulSurat |
| `sortOrder` | enum | - | asc \| desc |

**Headers:**
```
Cookie: better-auth.session_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Example:**
```bash
curl -X GET "http://localhost:3079/api/submission?page=1&limit=10&status=SUBMITTED" \
  -H "Cookie: better-auth.session_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Success (200):**
```json
{
  "success": true,
  "data": {
    "submissions": [
      {
        "id": "cmktcjvyk0001o9bg1uu3gam5",
        "judulSurat": "Lomba Competitive Programming Nasional",
        "jenisSurat": "SURAT_TUGAS",
        "statusInternal": "SUBMITTED",
        "statusDisplay": "DIPROSES",
        "currentActiveRole": "KAPRODI",
        "letterType": {
          "id": "cmktblwa50043o9rcfmw92xth",
          "name": "Surat Tugas",
          "code": "ST",
          "category": "UMUM"
        },
        "priority": "NORMAL",
        "submittedAt": "2026-01-25T06:10:30.844Z",
        "updatedAt": "2026-01-25T06:10:30.844Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "totalItems": 5,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

---

### 4. Create Submission (PRIVATE)
Membuat pengajuan surat baru (tanpa lampiran).

**Endpoint:** `POST /api/submission`

**Headers:**
```
Content-Type: application/json
Cookie: better-auth.session_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Body:**
```json
{
  "letterTypeId": "cmktblwa50043o9rcfmw92xth",
  "formData": {
    "nama": "Ahmad Budi Santoso",
    "nim": "24060121130001",
    "departemen": "Departemen Informatika",
    "programStudi": "S1 Informatika",
    "jenisSurat": "SURAT_TUGAS",
    "keperluan": "Mengikuti Lomba Competitive Programming untuk meningkatkan skill coding",
    "judulAcara": "Lomba Competitive Programming Nasional 2026",
    "tanggalAcara": "2026-02-15T09:00:00Z",
    "durasiAcara": "2 hari",
    "lokasiAcara": "Jakarta Convention Center",
    "butuhTtdKadep": true
  },
  "signatureConfig": {
    "targetSigner": "DEKAN",
    "requestKadepSign": true
  }
}
```

**Response Success (201):**
```json
{
  "success": true,
  "message": "Pengajuan surat berhasil dibuat",
  "data": {
    "id": "cmktcjvyk0001o9bg1uu3gam5",
    "status": "SUBMITTED",
    "statusDisplay": "DIPROSES",
    "currentActiveRole": "KAPRODI",
    "submittedAt": "2026-01-25T10:00:00.000Z"
  }
}
```

---

### 5. Create Submission with Files (PRIVATE)
Membuat pengajuan surat baru sekaligus upload lampiran (multipart/form-data).

**Endpoint:** `POST /api/submission/with-files`

**Headers:**
```
Content-Type: multipart/form-data
Cookie: better-auth.session_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Body (FormData):**
```javascript
const formData = new FormData();
formData.append('letterTypeId', 'cmktblwa50043o9rcfmw92xth');
formData.append('nama', 'Ahmad Budi Santoso');
formData.append('nim', '24060121130001');
formData.append('departemen', 'Departemen Informatika');
formData.append('programStudi', 'S1 Informatika');
formData.append('jenisSurat', 'SURAT_TUGAS');
formData.append('keperluan', 'Mengikuti Lomba Competitive Programming');
formData.append('judulAcara', 'Lomba Competitive Programming Nasional');
formData.append('tanggalAcara', '2026-02-15T09:00:00Z');
formData.append('durasiAcara', '2 hari');
formData.append('lokasiAcara', 'Jakarta Convention Center');
formData.append('butuhTtdKadep', 'true');
formData.append('targetSigner', 'DEKAN');
formData.append('requestKadepSign', 'true');
formData.append('attachments', file1); // File object
formData.append('attachments', file2); // File object

fetch('http://localhost:3079/api/submission/with-files', {
  method: 'POST',
  credentials: 'include',
  body: formData
});
```

**File Constraints:**
- Max files: 5
- Max size per file: 5MB
- Allowed formats: PDF, JPG, JPEG, PNG
- Field name: `attachments[]` (array)

**Response Success (201):**
```json
{
  "success": true,
  "message": "Pengajuan surat berhasil dibuat dengan 2 lampiran",
  "data": {
    "id": "cmktcjvyk0001o9bg1uu3gam5",
    "status": "SUBMITTED",
    "statusDisplay": "DIPROSES",
    "currentActiveRole": "KAPRODI",
    "attachments": [
      {
        "id": "attach1",
        "fileName": "proposal.pdf",
        "fileSize": 2048576
      },
      {
        "id": "attach2",
        "fileName": "surat-undangan.jpg",
        "fileSize": 1024000
      }
    ],
    "submittedAt": "2026-01-25T10:00:00.000Z"
  }
}
```

---

## 🚨 Common Errors

| Status | Error | Solusi |
|--------|-------|--------|
| 400 | Validation error | Cek field yang required dan formatnya |
| 400 | Keperluan minimal 10 karakter | Isi keperluan minimal 10 karakter |
| 400 | Judul acara minimal 5 karakter | Isi judul acara minimal 5 karakter |
| 400 | Lokasi acara minimal 3 karakter | Isi lokasi minimal 3 karakter |
| 400 | Tanggal acara wajib diisi (format: ISO datetime) | Gunakan format ISO datetime |
| 400 | File terlalu besar | Maksimal 5MB per file |
| 400 | Format file tidak didukung | Hanya PDF, JPG, PNG |
| 400 | Maksimal 5 file lampiran | Upload max 5 files |
| 401 | Unauthorized | Session expired, login ulang |
| 403 | Hanya MAHASISWA/DOSEN yang dapat membuat | Login dengan akun Mahasiswa/Dosen |
| 403 | Pengajuan tidak dapat diubah pada status ini | Sudah masuk proses, tidak bisa diubah |
| 404 | Surat tidak ditemukan | ID surat tidak valid |

---

## 📝 Validation Rules

| Field | Required | Min Length | Format |
|-------|----------|------------|--------|
| `nama` | ✅ | 2 | String |
| `nim` | ❌ | - | String (Mahasiswa) |
| `nip` | ❌ | - | String (Dosen) |
| `departemen` | ✅ | 1 | String |
| `programStudi` | ✅ | 1 | String |
| `jenisSurat` | ✅ | - | SURAT_TUGAS \| SURAT_KEPUTUSAN |
| `keperluan` | ✅ | 10 | String |
| `judulAcara` | ✅ | 5 | String |
| `tanggalAcara` | ✅ | - | ISO Datetime (2026-02-15T09:00:00Z) |
| `durasiAcara` | ❌ | - | String |
| `lokasiAcara` | ✅ | 3 | String |
| `butuhTtdKadep` | ❌ | - | Boolean (default: false) |
| `targetSigner` | ✅ | - | DEKAN \| WADEK_1 \| WADEK_2 |
| `requestKadepSign` | ❌ | - | Boolean (default: false) |

**File Upload Constraints:**
- Max files: 5
- Max size per file: 5MB (5,242,880 bytes)
- Allowed MIME types: `application/pdf`, `image/jpeg`, `image/jpg`, `image/png`
- Allowed extensions: `.pdf`, `.jpg`, `.jpeg`, `.png`

---

## 👥 Test Accounts

All accounts use password: `password1234`

| Role | Email | Nama |
|------|-------|------|
| MAHASISWA | ahmad.budi@students.undip.ac.id | Ahmad Budi Santoso |
| MAHASISWA | dewi.sartika@students.undip.ac.id | Dewi Sartika |
| DOSEN | raden.satrio@lecturer.undip.ac.id | Dr. Raden Satrio |

---

## 📌 Important Notes

1. **Authentication:** 
   - `GET /letter-types` dan `/letter-types/:id` adalah PUBLIC
   - Semua endpoint lainnya butuh login (MAHASISWA atau DOSEN)

2. **Cookie Management:**
   - Axios: gunakan `withCredentials: true`
   - Fetch: gunakan `credentials: 'include'`
   - Session token akan expired setelah X jam (sesuai config better-auth)

3. **Field Changes (REVISED):**
   - ❌ **REMOVED:** `email`, `noHp`, `tanggalSelesai`, `catatan`, `requestWadekSign`
   - ✅ **KEPT:** Signature config tetap ada (`targetSigner`, `requestKadepSign`)
   - 🔄 **CHANGED:** `tanggalAcara` sekarang **date & time** (ISO datetime format)

4. **File Upload:**
   - Maksimal 5 file per submission
   - Maksimal 5MB per file
   - Format: PDF, JPG, JPEG, PNG only
   - Field name: `attachments[]` (array untuk multipart form-data)

5. **Status Lifecycle:**
   - SUBMITTED → User sudah submit, menunggu Kaprodi
   - DIPROSES → Semua status proses (Kaprodi → Admin → Fakultas → UPA)
   - SELESAI → Surat final siap diambil
   - DIBATALKAN → User cancel sebelum masuk fakultas
   - DITOLAK → Rejected oleh reviewer

6. **Best Practices:**
   - Selalu cek permissions sebelum menampilkan action buttons
   - Implement client-side validation sebelum submit
   - Show user-friendly error messages
   - Cache letter types untuk performa
   - Use optimistic UI updates untuk better UX
