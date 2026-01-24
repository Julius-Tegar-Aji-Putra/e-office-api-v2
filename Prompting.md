# SPESIFIKASI TEKNIS & BISNIS E-OFFICE (SURAT TUGAS & SK DEKAN)

**Dokumen ini adalah Referensi Kebenaran (Source of Truth).**
**Instruksi untuk AI:** Implementasikan fitur backend berdasarkan spesifikasi detail di bawah ini menggunakan struktur Modular Monorepo yang tersedia.

---

## 1. Stack & Arsitektur
* **Framework**: Elysia + Bun + TypeScript.
* **Database**: PostgreSQL + Prisma ORM.
* **Architecture**: Modular Monorepo (`src/modules/*`).
* **Design Pattern**: Controller -> Service -> Repository.
* **Storage**: MinIO (S3 Compatible) untuk lampiran dan hasil generate PDF.

---

## 2. Struktur Database (Schema Requirements)

Pastikan `prisma/schema.prisma` mengakomodasi Enum dan Model berikut untuk mendukung skenario kompleks:

### Enums
1.  **`LetterCategory`**: `AKADEMIK`, `SUMBER_DAYA`, `UMUM`.
2.  **`DocumentType`**: `SURAT_PENGANTAR` (Lingkup Prodi), `SURAT_TUGAS` (Output Fakultas), `SURAT_KEPUTUSAN` (Output Fakultas).
3.  **`LetterStatus`**:
    * `SUBMITTED` (Baru diajukan Mahasiswa/Dosen)
    * `SURAT_PENGANTAR_PENDING` (Menunggu Draft Admin Prodi)
    * `SURAT_PENGANTAR_SIGNED` (Sudah TTD Prodi/Departemen)
    * `FAKULTAS_PENDING` (Masuk Admin Fakultas - Belum Disposisi)
    * `FAKULTAS_DISPOSITION` (Proses Disposisi Pejabat Turun ke Bawah)
    * `FAKULTAS_DRAFTING` (Proses Draft Staf)
    * `FAKULTAS_VERIFICATION` (Proses Verifikasi Pejabat Naik ke Atas)
    * `UPA_PROCESSING` (Proses Penomoran/Stempel)
    * `COMPLETED` (Selesai & Terdistribusi)
    * `REJECTED` (Ditolak Permanen oleh Kaprodi)
    * `RETURNED` (Dikembalikan oleh Fakultas ke Prodi/Pengaju untuk Revisi)

### Models Key Fields
* **`LetterInstance`**:
    * `submissionValues` (Json): Menyimpan data input form awal (Keperluan, Acara, Tanggal, dll) & request TTD Kadep.
    * `currentActiveRole` (String): Role ID yang sedang memegang "bola" (giliran).
    * `history` (Relation): Relasi ke tabel log history surat.
* **`LetterDocument`**:
    * `type`: DocumentType.
    * `content` (Json): Menyimpan struktur surat editable (HTML/Delta).
    * `signatories` (Json): Array object `{ role: string, name: string, status: 'PENDING'|'SIGNED', type: 'DIGITAL'|'MANUAL' }`.
    * `tembusan` (Json): Array user ID penerima tembusan.
* **`Attachment`**: Relasi ke file MinIO.

---

## 3. Implementasi Logic Per Modul (Business Rules)

### 🟢 MODUL A: SUBMISSION (Lingkup Departemen)
**Path**: `src/modules/submission`
**Aktor**: Mahasiswa / Dosen

1.  **Input Form**:
    * **Autofill**: Nama & Identitas dari Token.
    * **Input**: Jenis Surat (ST/SK), Keperluan, Judul Acara, Tanggal, Durasi, Lokasi, Lampiran.
    * **Opsi Tanda Tangan**: Checkbox "Butuh Tanda Tangan Ketua Departemen?".
2.  **State Awal**: Status `SUBMITTED`, Role `KAPRODI`.

### 🟢 MODUL B: DEPARTMENT-APPROVAL (Approval & Drafting Prodi)
**Path**: `src/modules/department-approval`
**API Prefix**: `/api/department-approval`
**Aktor**: Ketua Prodi, Admin Prodi, Ketua Departemen

1.  **Ketua Prodi (Approval)**:
    * **Approve**: Status -> `SURAT_PENGANTAR_PENDING`, Role -> `ADMIN_PRODI`.
    * **Tolak**: Status -> `DITOLAK`. Wajib alasan.
2.  **Admin Prodi (Drafting)**:
    * **Aksi**: Drafting Surat Pengantar dari template.
    * **Auto-Sign Config**:
        * Default: Kaprodi saja.
        * Jika request pengaju = true: Kaprodi + Kadep.
        * *Editable*: Admin bisa menambah/mengurangi pejabat penanda tangan.
    * **Submit**: Status -> `SURAT_PENGANTAR_SIGNED` (Pending TTD), Role -> `KAPRODI`.
3.  **Tanda Tangan (Berurutan)**:
    * **Kaprodi**: Sign -> Jika butuh Kadep, Role -> `KADEP`. Jika tidak, Role -> `ADMIN_FAKULTAS`.
    * **Kadep**: Sign -> Role -> `ADMIN_FAKULTAS`. Status -> `FAKULTAS_PENDING`.

### 🔵 MODUL C: DISPOSISI (Lingkup Fakultas - Masuk)
**Path**: `src/modules/disposisi`
**Aktor**: Admin Fakultas, Pejabat Struktural

1.  **Admin Surat Fakultas**:
    * **Aksi**: Pilih Jenis Surat (`AKADEMIK` / `SUMBER_DAYA` / `UMUM`).
    * **Routing Logic**:
        * `UMUM`: Semua Pejabat (Dekan, Wadek 1/2, Manajer TU).
        * `AKADEMIK`: Dekan, Wadek 1, Manajer TU, Spv Akademik.
        * `SUMBER_DAYA`: Dekan, Wadek 2, Manajer TU, Spv SD.
    * **Submit**: Role -> Pejabat Terpilih. Status -> `FAKULTAS_DISPOSITION`.
2.  **Pejabat (Disposisi Turun)**:
    * **Hirarki**: Dekan -> Wadek -> Manajer TU -> Supervisor -> Staf.
    * **Aturan**: Hanya bisa disposisi ke *bawah* (boleh lompat). Dropdown difilter sesuai Jenis Surat.
    * **Aksi**:
        * `Disposisi`: Teruskan ke bawah.
        * `Selesai`: Stop (Status `COMPLETED` tanpa output ST/SK, beri catatan).
        * `Kembalikan`: Return ke Admin Prodi (Status `DIKEMBALIKAN`).
    * **Fallback**: Jika tidak ada yang menyelesaikan, disposisi harus sampai ke Staf (ujung).

### 🔵 MODUL D: SURAT HASIL (Pengerjaan SK/ST)
**Path**: `src/modules/surat-hasil`
**Aktor**: Staf Akademik / Staf SD

1.  **Drafting**:
    * **Trigger**: Menerima disposisi akhir.
    * **Aksi**: "Buat Surat Keluar". Pilih Template ST/SK. Autofill data dari submission awal.
    * **State**: Status -> `FAKULTAS_DRAFTING`.
2.  **Verifikasi**:
    * **Aksi**: "Ajukan Verifikasi".
    * **Logic**: Kunci dokumen. Role -> Supervisor terkait. Status -> `FAKULTAS_VERIFICATION`.

### 🔵 MODUL E: FACULTY-APPROVAL (Verifikasi Berjenjang - Surat Keluar)
**Path**: `src/modules/faculty-approval`
**API Prefix**: `/api/faculty-approval`
**Aktor**: Supervisor -> Manajer TU -> Wadek -> Dekan

1.  **Jalur Verifikasi (Naik)**:
    * **Akademik**: Staf -> Spv Akad -> Manajer TU -> Wadek I -> Dekan.
    * **Sumber Daya**: Staf -> Spv SD -> Manajer TU -> Wadek II -> Dekan.
    * **Umum**:
        * Di Manajer TU, muncul opsi Multi-Select tujuan.
        * Bisa pilih Wadek I, Wadek II, atau **Keduanya**.
        * Jika Keduanya: Serial (Wadek II -> Wadek I -> Dekan).
2.  **Aksi Pejabat**:
    * `Verifikasi/Approve`: Naik 1 tingkat.
    * `Tanda Tangan`: Jika pejabat tersebut adalah penanda tangan di surat.
    * `Kembalikan`: Turun ke bawah (Bisa pilih Staf/Spv/Manajer TU). Status kembali ke `DRAFTING` (jika ke staf) atau `VERIFICATION`.
3.  **Final**: Jika Dekan (atau pejabat tertinggi di surat) sudah TTD -> Role `UPA`. Status -> `UPA_PROCESSING`.

### 🔵 MODUL F: LEGALISASI (Finishing UPA)
**Path**: `src/modules/legalisasi`
**Aktor**: UPA

1.  **Penomoran**: Input Nomor Surat (Cek duplikasi) & Tanggal Surat.
2.  **Stempel & Barcode**:
    * Bubuhkan stempel di sebelah kiri TTD jabatan tertinggi.
    * Generate Barcode (QR) validasi di footer kanan.
3.  **Terbitkan**: Status -> `COMPLETED`. Distribusi ke semua user di list `tembusan`.

---

## 4. Spesifikasi Dashboard (Wajib Sesuai Kolom)

Implementasikan `src/routes/dash.ts` dengan filter dan kolom berikut:

**[Lingkup Departemen]**
* **Mahasiswa/Dosen**: Judul, Tipe, Tanggal, Status, Aksi.
* **Ketua Prodi**: Nama Pengaju, Judul, Tipe, Tanggal, Status, Aksi.
* **Admin Prodi & Kadep**: Nama Pengaju, Judul, Tipe, Tanggal, Status, Aksi.

**[Lingkup Fakultas]** (Tab Terpisah: Surat Masuk / Surat Keluar)
* **Admin Fakultas**:
    * *Masuk*: Nama Pengaju, Judul, Tipe, Tanggal, Status, Aksi.
    * *Keluar*: Judul, Tipe, Jenis, Tanggal, Status, Aksi.
* **Pejabat (Dekan/Wadek/Manajer TU/Spv)**:
    * *Masuk/Keluar*: Sama seperti Admin Fakultas (Tambah kolom 'Jenis' di Masuk).
* **Staf**:
    * *Masuk/Keluar*: Sama seperti Pejabat.
* **UPA**:
    * Kolom: Judul, Nomor Surat (Placeholder '-' jika kosong), Tipe, Jenis, Tanggal, Status, Aksi.

---

## 5. Kamus Status (Mapping Frontend)

Gunakan mapping ini untuk response API agar status terbaca manusiawi:

| Role Login | Kondisi Database | Tampilan Dashboard |
| :--- | :--- | :--- |
| **Pengaju** | `SUBMITTED`, `PENDING`, `DISPOSITION`, `VERIFICATION`, `DRAFTING` | **DIPROSES** |
| | `COMPLETED` | **SELESAI** |
| | `REJECTED` | **DITOLAK** |
| | `RETURNED` | **DIKEMBALIKAN KE PENGAJU** |
| **Ketua Prodi** | `SUBMITTED` | **MENUNGGU DIVERIFIKASI** |
| | `SURAT_PENGANTAR_SIGNED` + Role Login | **MENUNGGU DITANDATANGANI** |
| **Admin Prodi** | `SURAT_PENGANTAR_PENDING` | **MENUNGGU ANDA** |
| **Kadep** | `SURAT_PENGANTAR_SIGNED` + Role Login | **MENUNGGU DITANDATANGANI** |
| **Admin Fak** | `FAKULTAS_PENDING` | **MENUNGGU ANDA** |
| **Pejabat** | `FAKULTAS_DISPOSITION` / `VERIFICATION` + Role Login | **MENUNGGU ANDA** |
| **Staf** | `FAKULTAS_DRAFTING` + Role Login | **MENUNGGU ANDA** |
| **UPA** | `UPA_PROCESSING` | **MENUNGGU ANDA** |

---

## 6. Logic Tampilan Detail & Aksi (UI States)

Backend harus mengirim flag permissions (`canApprove`, `canSign`, `canDraft`, `showLetterResult`, `showLetterPengantar`) ke frontend berdasarkan aturan ini:

1.  **View Kiri/Kanan**:
    * *Belum Ada Dokumen*: Kiri (Formulir Awal), Kanan (Riwayat).
    * *Ada Pengantar*: Kiri (Surat Pengantar + Form di bawahnya), Kanan (Riwayat).
    * *Ada Hasil (ST/SK)*: Kiri (Surat Hasil + Pengantar), Kanan (Riwayat).
    * *Tembusan Final*: Kiri (Surat Hasil), Kanan (Riwayat).
2.  **Tombol Aksi**:
    * **Mahasiswa**: Download (Hanya jika Status `SELESAI`).
    * **Kaprodi**: Setujui/Tolak (Saat `SUBMITTED`). Tanda Tangan (Saat `PENGANTAR_SIGNED`).
    * **Admin Prodi**: Draft Surat (Saat `PENGANTAR_PENDING`).
    * **Pejabat**: Disposisi/Selesai/Kembalikan (Saat `DISPOSITION`). Verif/TTD/Kembalikan (Saat `VERIFICATION`).
    * **Staf**: Draft/Verifikasi (Saat `DRAFTING`).
    * **UPA**: Penomoran/Stempel (Saat `UPA_PROCESSING`).

AI Version E-Office ST/SK Dekan:
E-Office Surat Tugas/ Surat Keputusan Dekan

Skenarionya seperti ini:
[Lingkup Departemen]
1. Dimulai dari Mahasiswa/Dosen mengajukan data diri yang bisa autofill dan tetap bisa editable, memilih jenis surat yang dibutuhkan surat tugas/keputusan, lalu mengisi isian keperluan, isian acara apa, tanggal acara, durasi acara, dan lokasi acara dan lampiran-lampirannya yang akan diajukan. Disini pengaju juga dapat memilih untuk surat pengantar dibutuhkan tanda tangan sampai mana bisa sampai ketua prodi saja atau bisa ditambah dengan ketua departemen.
2. Data data dan keperluan pengajuan akan di cek oleh Ketua Prodi
3. Setelah disetujui oleh Ketua Prodi, maka akan diteruskan ke Admin Prodi. Jika Tidak maka akan diberikan catatan penolakan ke Pengaju.
4. Pada Admin Prodi tugannya adalah untuk melakukan drafting surat PENGANTAR dengan drafting surat pengantar jadi terdapat template dasar dan bisa diedit seperti word tulisan kata katanya dapat diubah namun tanda tangan disini diatur secara otomatis sesuai total banyaknya tanda tangan yang di request pengaju.Untuk lebih lengkapnya ada dibagian akhir drafting surat. Admin Prodi dapat mengubah konfigurasi tanda tangan yang di-request pengaju (menambah/mengurangi/mengganti pejabat). Tombol Drafting Surat disini otomatis akan mati Ketika sudah jadi surat pengantarnya.
5. Setelah surat pengantar jadi maka akan diteruskan ke Ketua Prodi Kembali.
6. Ketua Prodi menandatangani, lalu diserahkan ke Ketua Departemen.
7. Ketua Departemen menandatangani, lalu diserahkan ke Fakultas.

[Lingkup Fakultas]
Aturan tambahan: Surat dipisahkan menjadi surat masuk dan surat keluar, dimana surat masuk adalah surat yang masuk ke fakultas seperti surat pengantar, sedangkan surat keluar adalah surat tugas/keputusan itu sendiri jadi nanti untuk dashboard bagian fakultas dapat disesuaikan, untuk lingkup departemen tetap sama dianggap sebagai sebuah surat.
8. Surat pengantar diterima oleh Admin Surat Fakultas.
9. Admin surat dapat melakukan hal ini:
   i. Memilih Jenis Surat ( Akademik, Sumber Daya, Umum karena nanti akan akan berpengaruh ke Filter pejabat mana saja yang bisa dipilih untuk disposisi.)
   ii. Meneruskan ke pejabat disini akan dipengaruhi oleh filter.
Catatan Meneruskan: 
   a. Jika opsi Umum, maka semua pejabat akan ada didalamnya termasuk dekan dan manajer TU.
   b. Jika opsi Akademik, maka ada Dekan, Wakil Dekan I, Manajer Tata Usaha, Supervisor Akademik, dan staf" akademik disini bisa banyak.
   c. Jika opsi Sumber Daya, maka ada Dekan, Wakil Dekan II, Manajer Tata Usaha, Supervisor Supervisor Akademik, dan staf" sumber daya disini bisa banyak.

10. Pejabat FSM (Dekan, Wadek I, Wadek II, Manajer TU, Supervisor Akademik/Sumber Daya) alur saat Surat Masuk
    Aturan umum: Setelah diteruskan dari Admin Surat Fakultas maka aturannya adalah dari yang pangkatnya paling tinggi ke pangkat yang paling Bawah saat disposisi,
    Tingkatan di Fakulktas: Dekan -> Wakil Dekan I/II -> Manajer Tata Usaha -> Supervisor Akademik/Sumnber Daya -> Staf Akademik/Sumberdaya.
    Disposisi dapat melompat selama masih sesuai aturan tingkatan, contoh: Dekan disposisi ke Manajer Tata Usaha langsung itu diperbolehkan, karena dekan tingkatannya lebih tinggi.
    Drop Down untuk pilihan disposisi nanti opsi opsinya harus menyesuaikan tingkatannya tidak boleh yang levelnya lebih rendah bisa memilih orang dengan jabatan yang lebih tinggi.

    Aturan Disposisi:
    - Surat hanya bisa didisposisikan ke pejabat yang ditingkatan bawahnya.
    - Pemilihan drop down disposisi harus sudah disesuaikan dengan jenis suratnya Akademik/Sumber Daya/Umum. Referensi kelompok disposisi ada di catatan nomor 9.
    
    Aksi Tombol per rolenya:
    Dekan/Wakil Dekan I/II / Manajer TU dan Supervisor Akademik/Sumber Daya:
    i. Selesai:Surat dinyatakan selesai dibagian dekan dengan memberikan kolom catatan mengapa surat cukup diproses sampai pejabat terkait saja.
    ii. Disposisi ke pejabat bawahnya.
    iii. Kembalikan, dikembalikan dengan memilih role diatasnya jadi sebelum ini dengan defaultnya adalah Admin Surat Fakultas namun bisa dikembalikan ke yang meneruskan/disposisi sebelumnya seperti itu.
  
   Pada skenario pejabat tidak ada yang menyelesaikan surat masuk dibagiannya, maka akan terus disposisi sampai dititik akhir dimana Supervisor Akademik/Sumber Daya maka opsi akhirnya adalah diposisi 1 staf akademik/sumber daya.

11. Staf Akademik/Sumber Daya yang dipilih dapat melakukan hal ini:
   i. Drafting Surat Keluar (Surat Tugas/Keputusannya). Hal ini saat membuka sebuah surat masuk  ii. Dari halaman dashboard staf juga dapat membuat surat keluar bentuknya akan sama dengan dengan drafting surat dari poin i. Peletakan tombol Drafting surat dari dashboard dapat dibuat sama dengan tombol buat pengajuan dari mahasiswa/dosen. Detail untuk Drafting Surat akan dijelaskan diakhir. Disini yang terpenting adalah dia harus memilih Jenis Surat sekaligus karena akan berpengaruh saat proses verifikasi sesuai lingkupnya apakah Surat Akademik/Sumber Daya/Umum. 
  Catatan Drafting Surat, tombol drafting surat akan bisa tetap aktif selama staf belum melakukan tombol verifikasi.
  iii. Verifikasi, maka surat ini akan diteruskan kepada supervisor. Maka otomatis tombol Drafting Surat dinonaktifkan, disini tombol dapat aktif kembali jika dan hanya jika surat keluar terseut Kembali pada staff terkait. Jadi dari surat yang telah dibuat tadi akan Kembali ke staf ini dan dapat mengedit kesalahannya, tidak membuat dari 0.

12. Pejabat FSM (Dekan, Wadek I, Wadek II, Manajer TU, Supervisor Akademik/Sumber Daya) alur saat Surat Keluar.
    Aturan umum: Setelah surat keluar dihasilkan maka akan melakukan verifikasi secara berurutan sesuai tingkatan lingkupnya dan tidak boleh melompat, 
    Jika surat itu jenisnya Akademik maka urutan verifikasinya adalah Staf akademik -> Supervisor Akademik -> Manajer TU -> Wakil Dekan I -> Dekan
    Jika surat itu jenisnya Sumber Daya maka urutan verifikasinya adalah Staf Sumber Daya -> Supervisor Daya -> Manajer TU -> Wakil Dekan II -> Dekan
    Jika surat itu jenisnya umum maka akan ada perlakuan khusus dimana ada setelah menekan verifikasi dibawahnya ada tombol Melanjutkan verifikasi ke 1 tingkat diatasnya,
    contoh skenario: Staf Pembuat surat (staf ini dapat dari akademik maupun sumber daya) -> Dapat memilih supervisor akademik/sumberdaya -> supervisor terpilih -> manajer TU -> manajer TU dapat memilih Wakil Dekan I atau Wakil Dekan II-> Wakil Dekan I/II langsung melakukan verifikasi saja tidak perlu memilih lagi -> Dekan. Saat memverifikasi surat jenis UMUM, Manajer TU atau Pejabat terkait memiliki opsi MULTI-SELECT untuk tujuan selanjutnya jika memang jalurnya harus paralel atau seri (misal: Pilih WD1 & WD2 sekaligus, atau pilih salah satu). maka alurnya adalah: Ketika multi select akan selalu Wadek II -> Wadek I baru lanjut ke Dekan untuk menyederhanakan.

    Supervisor Akademik/Sumber Daya:
    - Verifikasi. 
    - Drafting surat, disini hanya mengedit dengan hasil drafting surat dari staf. Sama seperti staf Ketika dia sudah klik verifikasi maka supervisor sudah tidak dapat mengedit lagi
    - Kembalikan, disini tombol kembalikan fungsinya adalah untuk mengembalikan surat dan bisa memilih tujuannya, disini kembalikan hanya ke role yang ada dibawahnya boleh lompat. 
Kalau supervisor hanya staf yang mengerjakan saja untuk Kembalikannya. Dengan memberikan catatan mengapa dikembalikan.

    Manajer TU:
    - Verifikasi. 
    - Kembalikan, disini tombol kembalikan fungsinya adalah untuk mengembalikan surat dan bisa memilih tujuannya, disini kembalikan hanya ke role yang ada dibawahnya boleh lompat. Kalau Manajer TU ada 2 opsi yaitu Supervisor yang memverifikasi dan staf yang mengerjakan untuk Kembalikannya. Dengan memberikan catatan mengapa dikembalikan.

    Wakil Dekan I/II: 
    - Verifikasi ATAU Tanda Tangan jika dari suratnya diperlukan, jika salah satu tombol ini diklik maka akan diteruskan ketingkat yang lebih tinggi
    - Kembalikan, disini tombol kembalikan fungsinya adalah untuk mengembalikan surat dan bisa memilih tujuannya, disini kembalikan hanya ke role yang ada dibawahnya boleh lompat. Kalau Wakil Dekan I/II ada 3 opsi yaitu Manajer TU, Supervisor yang memverifikasi dan staf yang mengerjakan untuk Kembalikannya. Dengan memberikan catatan mengapa dikembalikan.   

    Dekan: 
    - Verifikasi ATAU Tanda Tangan jika dari suratnya diperlukan, jika salah satu tombol ini diklik maka akan diteruskan ketingkat yang lebih tingg    
    - Kembalikan, disini tombol kembalikan fungsinya adalah untuk mengembalikan surat dan bisa memilih tujuannya, disini kembalikan hanya ke role yang ada dibawahnya boleh lompat. Kalau Wakil Dekan I/II ada 3 opsi yaitu Manajer TU, Supervisor yang memverifikasi dan staf yang mengerjakan untuk Kembalikannya. Dengan memberikan catatan mengapa dikembalikan.    

    Catatan:
    Jika ada skenario khusus dimana dibutuhkan tanda tangan kedua wakil dekan I dan II maka akan terdapat alur khusus Wakil Dekan II -> Wakil Dekan I -> Dekan, skenario ini mungkin dapat terjadi jika jenis suratnya adalah umum. 

13. Sesaat setelah semua tanda tangan selesai maka surat akan masuk ke UPA (Unit Pelaksana Akademik)
    - Menginput tanggal surat akan dibuat disini pakai library, tidak dengan manual.
    - Lalu penomoran akan diisi manual, tetapi disini dia dapat melihat daftar nomor surat untuk mengecek apakah nomor surat ini pernah dipakai atau tidak.
    - Setelah itu Tombol aksi Berikan Penomoran akan aktif, jika diklik maka di tampilan surat yang tanda tangannya sudah lengkap akan diisikan nomor suratnya beserta kapan surat ini dibuat.
    - Setelah itu Bubuhkan Stempel, disini harap diperhatikan untuk bubuhkan stemple tempatnya akan berada dibagian akan ada di tanda tangan jabatan tertinggi dan agak digeser ke kiri sedikit.
    - Saat ini juga dibagian footer sebelah kanan akan dibuatkan barcode untuk membuktikan bahwa surat ini asli dibuat oleh Fakultas Sains dan Matematika Universitas Diponegoro. 

14. Setelah surat selesai diproses UPA maka surat akan dikirimkan ke semua tembusan yang ada di surat tersebut.

Aturan Umum:
- Tanda tangan dibuat 3 opsi dimana ada Upload File Gambar dan dapat disimpan sebagai template dengan menamainya, Handwriting dan dapat disimpan juga sebagai template dengan menamainya, Memilih dari template yang sudah ada.

Aturan Umum Drafting Surat: 
Dokumen Editable berbentuk seperti Docx, disini siapkan saja seperti schemanya dimana nanti ada template dasar 3 suratnya bentuk html yang nanti diambil buat jadi sebuah surat setelah dilakukan pengeditan.

TAMPILAN DAN AKSI DETAIL SURAT SEMUA ROLE:
Aksi Detail Surat:
    
[Lingkup Departemen]
Mahasiswa/Dosen:
- Jika Surat Tugas/Keputusan belum jadi: 
  Disebelah kiri:
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.
  
  Disebelah kanan:
  Riwayat Surat

  Aksi: Tidak ada

- Jika Surat Tugas/Keputusan sudah jadi:
  Surat Tugas/Keputusan
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.

  Disebelah kanan:
  Riwayat Surat

  Aksi: 
  - Download Surat

- Jika Surat Pengantar dikembalikan oleh Fakultas/ Ditolak Kaprodi:
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.

  Disebelah kanan:
  Riwayat Surat
  Alasan Dikembalikan/ Ditolak

  Aksi: 
  - Tidak ada

Ketua Prodi:
- Jika Pengajuan belum disetujui: 
  Disebelah kiri:
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.
  
  Disebelah kanan:
  Riwayat Surat

  Aksi: 
  - Setujui
  - Tolak

- Jika Pengajuan sudah disetujui tetapi belum ditanda tangani: 
  Disebelah kiri:
  Surat Pengantar
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.
  
  Disebelah kanan:
  Riwayat Surat

  Aksi: 
  - Tanda Tangan.

- Jika Pengajuan sudah disetujui dan ttd, dan surat tugas/keputusan belum jadi: 
  Disebelah kiri:
  Surat Pengantar
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.
  
  Disebelah kanan:
  Riwayat Surat

  Aksi: Tidak ada

- Jika Pengajuan sudah disetujui dan ttd, dan ST/SK sudah jadi namun bukan merupakan tujuan dari tembusan:
  Surat Pengantar
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.

  Disebelah kanan:
  Riwayat Surat

  Aksi: Tidak ada

- Jika Pengajuan sudah disetujui dan ttd, dan ST/SK sudah jadi dan merupakan tujuan dari tembusan:
  Surat Tugas/Keputusan
  Surat Pengantar
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.

  Disebelah kanan:
  Riwayat Surat

  Aksi: Download Surat

Admin Prodi:
- Jika Pengajuan sudah disetujui oleh Ketua Prodi, dan namun belum dibuatkan surat pengantar: 
  Disebelah kiri:
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.
  
  Disebelah kanan:
  Riwayat Surat

  Aksi:
  - Draft Surat 

- Jika Pengajuan sudah disetujui oleh Ketua Prodi, dan sudah dibuatkan surat pengantar: 
  Surat Pengantar
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.
  
  Disebelah kanan:
  Riwayat Surat

  Aksi:
  - Draft Surat 

- Jika Surat Pengantar dikembalikan oleh Fakultas:
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.

  Disebelah kanan:
  Riwayat Surat
  Alasan Dikembalikan/ Ditolak

  Aksi: 
  - Tidak ada

Ketua Departemen:
- Jika Pengajuan belum ditanda tangani: 
  Disebelah kiri:
  Surat Pengantar
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.
  
  Disebelah kanan:
  Riwayat Surat

  Aksi: 
  - Tanda Tangan.

- Jika Pengajuan sudah ttd, dan surat tugas/keputusan belum jadi: 
  Disebelah kiri:
  Surat Pengantar
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.
  
  Disebelah kanan:
  Riwayat Surat

  Aksi: Tidak ada

- Jika Pengajuan sudah ttd, dan ST/SK sudah jadi namun bukan merupakan tujuan dari tembusan:
  Surat Pengantar
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.

  Disebelah kanan:
  Riwayat Surat

  Aksi: Tidak ada

- Jika Pengajuan sudah ttd, dan ST/SK sudah jadi dan merupakan tujuan dari tembusan:
  Surat Tugas/Keputusan
  Surat Pengantar
  Tampilan Formulir awal yang sudah diisikan.
  Lampiran dari Pengajuan.

  Disebelah kanan:
  Riwayat Surat

  Aksi: Download Surat

[Lingkup Fakultas]
Admin Surat Fakultas:
- Surat Masuk (Dari Prodi)
  - Jika surat belum diproses (Baru Masuk):
    Di sebelah kiri:
    Surat Pengantar 
    Tampilan Formulir awal
    Lampiran dari Pengajuan
    
    Di sebelah kanan:
    Riwayat Surat
    
    Aksi: 
    - Pilih Jenis Surat (Umum/Akademik/Sumber Daya)
    - Teruskan (Ke Pejabat Terkait)

  - Jika surat sudah diproses (Sudah Diteruskan):
    Di sebelah kiri:
    Surat Pengantar
    Tampilan Formulir awal
    Lampiran dari Pengajuan
    
    Di sebelah kanan:
    Riwayat Surat
    
    Aksi: Tidak ada 

- Surat Keluar (Hasil Akhir)
  - Jika ST/SK sudah jadi dan role ini menjadi tembusan:
    Di sebelah kiri:
    Surat Tugas/Keputusan
    
    Di sebelah kanan:
    Riwayat Surat
    
    Aksi: 
    - Download Surat
    
  - Jika ST/SK sudah jadi dan role ini bukan menjadi tembusan:
    Surat Tidak Tampil
        
        
Pejabat (Dekan/Wadek/Manajer TU):
- Surat Masuk
  - Jika surat masuk belum diproses oleh Pejabat untuk didisposisi/kembalikan
    Di sebelah kiri:
    Surat Pengantar
    Tampilan Formulir awal
    Lampiran dari Pengajuan
    
    Di sebelah kanan:
    Riwayat Surat
    
    Aksi:
    - Disposisi (Pilih Pejabat/Staf dibawahnya)
    - Selesai (Stop proses, beri catatan)
    - Kembalikan (Tolak ke Admin Prodi -> Dead End)
    
  - Jika surat masuk sudah diproses oleh Pejabat setelah didisposisi/kembalikan
    Surat pengantar
    Tampilan Formulir awal yang sudah diisikan
    Lampiran dari pengajuan

    Di sebelah kanan:
    Riwayat surat

    Aksi: Tidak ada

- Surat Keluar 
- Jika surat keluar belum diproses oleh Pejabat untuk ditandatangani/verifikasi
    Surat keluar (surat tugas atau surat keputusan)
    Di sebelah kanan:
    Riwayat surat
    
    Aksi:
    - Tanda tangan atau Verifikasi
    - Kembalikan (Ke pejabat bawahnya).

- Jika surat keluar sudah diproses oleh Pejabat setelah ditandatangani/verifikasi.
    Surat keluar (surat tugas atau surat keputusan)
    
    Di sebelah kanan:
    Riwayat surat
    
    Aksi: Tidak ada
 
- Jika Pengajuan sudah ttd, dan ST/SK sudah jadi namun bukan merupakan tujuan dari tembusan:
  Surat keluar (surat tugas atau surat keputusan)

  Disebelah kanan:
  Riwayat Surat

  Aksi: Tidak ada

- Jika Pengajuan sudah ttd, dan ST/SK sudah jadi dan merupakan tujuan dari tembusan:
  Surat keluar (surat tugas atau surat keputusan)

  Disebelah kanan:
  Riwayat Surat

  Aksi: Download Surat
        
Supervisor Akademik/ Sumber Daya
Surat Masuk
- Jika surat masuk belum diproses oleh supervisor untuk didisposisi/kembalikan
    Surat pengantar
    Tampilan Formulir awal yang sudah diisikan
    Lampiran dari pengajuan
    
    Di sebelah kanan:
    Riwayat surat
    
    Aksi:
    - disposisi (dropdown aktor yang akan didisposisi)
    - kembalikan
    
- Jika surat masuk sudah diproses oleh Supervisor setelah didisposisi/kembalikan
    Surat pengantar
    Tampilan Formulir awal yang sudah diisikan
    Lampiran dari pengajuan
    
    Di sebelah kanan:
    Riwayat surat
    
    Aksi: Tidak ada

Surat Keluar:
- Jika surat belum diproses oleh Supervisor ketika surat masuk diverifikasi oleh Staff ke Supervisor (untuk keperluan drafting surat)
  Surat Keluar
    
  Di sebelah kanan:
  Riwayat surat

  Aksi:
  - Verifikasi
  - Draft Surat
  - Kembalikan ke staf
        
- Jika surat sudah diproses oleh Supervisor ketika surat masuk diverifikasi oleh SUpervisor ke Manajer TU 
  Surat Keluar
    
  Di sebelah kanan:
  Riwayat surat

  Aksi: Tidak ada

- Jika Pengajuan sudah ttd, dan ST/SK sudah jadi namun bukan merupakan tujuan dari tembusan:
  Surat Tugas/Keputusan

  Disebelah kanan:
  Riwayat Surat

  Aksi: Tidak ada

- Jika Pengajuan sudah ttd, dan ST/SK sudah jadi dan merupakan tujuan dari tembusan:
  Surat Tugas/Keputusan

  Disebelah kanan:
  Riwayat Surat

  Aksi: Download Surat
        
Staf A/SD
- Surat Masuk
- Jika surat belum diproses oleh Staf A/SD
    Di sebelah kiri:
    Surat pengantar
    Tampilan Formulir awal yang sudah diisikan
    Lampiran dari pengajuan
    
    Di sebelah kanan:
    Riwayat surat
    
    Aksi: Draft Surat


- Jika ST/SK sudah diproses oleh Staf A/SD
    Di sebelah kiri:
    Surat Tugas/Keputusan
    
    Di sebelah kanan:
    Riwayat Surat
    
    Aksi: Tidak ada

- Surat Keluar:
- Jika surat sudah dibuat oleh Staf A/SD atau dikembalikan:
    Di sebelah kiri:
    Surat Tugas/Keputusan
    
    Di sebelah kanan:
    Riwayat surat
    
    Aksi: Draft Surat, Ajukan Verifikasi
        
- Jika surat sudah dibuat oleh Staf A/SD dan lanjut verifikasi:
    Di sebelah kiri:
    Surat Tugas/Keputusan
    
    Di sebelah kanan:
    Riwayat surat
    
    Aksi: Tidak ada
        
UPA
- Jika surat belum diproses oleh UPA
    Di sebelah kiri:
    Surat Tugas/Keputusan
    
    Di sebelah kanan:
    Riwayat Surat
    
    Aksi: Isi Nomor Surat, Bubuhkan Stempel
        
- Jika surat sudah diproses oleh UPA
    Di sebelah kiri:
    Surat Tugas/Keputusan

    Di sebelah kanan:
    Riwayat Surat
    
    Aksi: Tidak ada
    
=======================================================================================================================================

Dashboard:
[Lingkup Departemen] 
Mahasiswa/Dosen:
Aksi: Search Filter + Ajukan Surat
Isi Tabel: 
- Judul Surat
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Tanggal Surat
- Status
- Aksi

Ketua Prodi:
Aksi: Search Filter
Isi Tabel: 
- Nama Pengaju
- Judul Surat
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Tanggal Surat
- Status
- Aksi

Admin Prodi:
Aksi: Search Filter
Isi Tabel: 
- Nama Pengaju
- Judul Surat
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Tanggal Surat
- Status
- Aksi

Ketua Departemen:
Aksi: Search Filter
Isi Tabel: 
- Nama Pengaju
- Judul Surat
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Tanggal Surat
- Status
- Aksi

[Lingkup Fakultas]
Admin Surat Fakultas
Aksi: Pilih Surat Masuk/Surat Keluar. Search Filter
Isi Tabel Surat Masuk: 
- Nama Pengaju
- Judul Surat
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Tanggal Surat
- Status
- Aksi

Isi Tabel Surat Keluar: 
- Judul Surat
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Jenis Surat (Akademik/Sumber Daya/Umum)
- Tanggal Surat
- Status
- Aksi

Dekan/ Wakil Dekan I dan II/ Manajer TU/ Supervisor Akademik atau Sumber Daya
Aksi: Pilih Surat Masuk/Surat Keluar. Search Filter
Isi Tabel Surat Masuk: 
- Nama Pengaju
- Judul Surat
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Jenis Surat (Akademik/Sumber Daya/Umum)
- Tanggal Surat
- Status
- Aksi

Isi Tabel Surat Keluar: 
- Judul Surat
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Jenis Surat (Akademik/Sumber Daya/Umum)
- Tanggal Surat
- Status
- Aksi

Staf Akademik atau Sumber Daya
Aksi: Pilih Surat Masuk/Surat Keluar. Buat Surat + Search Filter
Isi Tabel Surat Masuk: 
- Nama Pengaju
- Judul Surat
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Jenis Surat (Akademik/Sumber Daya/Umum)
- Tanggal Surat
- Status
- Aksi

Isi Tabel Surat Keluar: 
- Judul Surat
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Jenis Surat (Akademik/Sumber Daya/Umum)
- Tanggal Surat
- Status
- Aksi

Unit Pelaksana Akademik (UPA):
Aksi: Search Filter
Isi Tabel: 
- Judul Surat
- Nomor Surat (Isinya - atau Sudah bernomor)
- Tipe Surat (Surat Tugas/Surat Keputusan)
- Jenis Surat (Akademik/Sumber Daya/Umum)
- Tanggal Surat
- Status
- Aksi

KAMUS DEFINISI STATUS SURAT UNTUK TIAP AKTOR

AKTOR 1: MAHASISWA/DOSEN
    STATUS "DIPROSES"       : Surat sedang diproses.
    STATUS "SELESAI"        : Surat telah berhasil dibuat, Mahasiswa/Dosen dapat mengunduh surat.
    STATUS "DITOLAK"        : Surat telah ditolak oleh Ketua Prodi.
    STATUS "DIKEMBALIKAN KE PENGAJU"   : Surat telah dikembalikan oleh Fakultas ke Mahasiswa/Dosen.

AKTOR 2: KETUA PRODI
    STATUS "MENUNGGU DIVERIFIKASI"      : Ketua Prodi perlu menyetujui/menolak.
    STATUS "MENUNGGU DITANDATANGANI"    : Ketua Prodi perlu menandatangani.
    STATUS "DIPROSES"                   : Surat sedang diproses oleh aktor lain.
    STATUS "SELESAI"                    : Surat telah berhasil dibuat, Ketua Prodi dapat mengunduh surat jika mendapatkan tembusan.
    STATUS "DITOLAK"                    : Surat telah ditolak oleh Ketua Prodi.
    STATUS "DIKEMBALIKAN KE PENGAJU"    : Surat telah dikembalikan oleh Fakultas ke Mahasiswa/Dosen.
        
AKTOR 3: ADMIN PRODI
    STATUS "MENUNGGU ANDA" : Admin Prodi perlu melakukan aksi (membuat draft surat pengantar).
    STATUS "DIPROSES"      : Surat sedang diproses oleh aktor lain.
    STATUS "SELESAI"       : Surat telah berhasil dibuat, Admin Prodi dapat mengunduh surat jika mendapatkan tembusan.
    STATUS "DIKEMBALIKAN KE PENGAJU"   : Surat telah dikembalikan oleh Fakultas ke Mahasiswa/Dosen.
    
AKTOR 4: KETUA DEPARTEMEN
    STATUS "MENUNGGU DITANDATANGANI"    : Ketua Departemen perlu menandatangani.
    STATUS "DIPROSES"                   : Surat sedang diproses oleh aktor lain.
    STATUS "SELESAI"                    : Surat telah berhasil dibuat, Ketua Departemen dapat mengunduh surat jika mendapatkan tembusan.
    STATUS "DIKEMBALIKAN KE PENGAJU"    : Surat telah dikembalikan oleh Fakultas ke Mahasiswa/Dosen.
        
AKTOR 5: ADMIN SURAT FAKULTAS
    STATUS "MENUNGGU ANDA"              : Admin Surat Fakultas perlu memilih jenis surat dan meneruskan.
    STATUS "DIPROSES"                   : Surat sedang diproses oleh aktor lain.
    STATUS "SELESAI"                    : Surat telah berhasil dibuat, Admin Surat Fakultas dapat mengunduh surat jika mendapatkan tembusan.
    STATUS "DIKEMBALIKAN KE PENGAJU"    : Surat telah dikembalikan oleh Fakultas ke Mahasiswa/Dosen. 
        
AKTOR 6: PEJABAT (DEKAN, WADEK I, WADEK II, Manajer TU)
    STATUS "MENUNGGU ANDA"  : Pejabat perlu melakukan aksi (verifikasi, disposisi, kembalikan ke awal, atau ttd untuk dekan/wadek)
    STATUS "DIPROSES"       : Surat sedang diproses oleh aktor lain karena didisposisi.
    STATUS "DIKEMBALIKAN"   : Surat telah dikembalikan ke Admin Prodi dan/atau Mahasiswa/Dosen
    STATUS "SELESAI"        : Surat telah berhasil dibuat, Pejabat dapat mengunduh surat jika mendapatkan tembusan.   
    
AKTOR 7: SUPERVISOR
     STATUS "MENUNGGU ANDA"  : Pejabat perlu melakukan aksi (verifikasi, disposisi, kembalikan, drafting)
    STATUS "DIPROSES"       : Surat telah diproses oleh aktor lain karena didisposisi.
    STATUS "DIKEMBALIKAN"   : Surat telah dikembalikan ke admin prodi dan/atau Mahasiswa/Dosen.
    STATUS "SELESAI"        : Surat telah berhasil dibuat, Supervisor dapat mengunduh surat jika mendapatkan tembusan.
        
AKTOR 8: STAF AKADEMIK/SUMBER DAYA 
    STATUS "MENUNGGU ANDA" : Staf Akademik/Sumber Daya perlu melakukan aksi (membuat draft surat keluar, verifikasi).
    STATUS "DIPROSES"      : Surat sedang diproses oleh aktor lain.
    STATUS "SELESAI"       : Surat telah berhasil dibuat, Staf Akademik/Sumber Daya dapat mengunduh surat jika mendapatkan tembusan.
        
AKTOR 9: UPA
    STATUS "MENUNGGU ANDA"  : UPA perlu menomori surat dan membubuhkan stempel.
    STATUS "SELESAI"        : Surat telah berhasil dibuat, UPA dapat mengunduh surat jika mendapatkan tembusan.

src/
├── app.ts                              # Hono app instance & global middleware
├── config.ts                           # App-wide configuration
├── index.ts                            # Main entry point (alternative)
├── routes.ts                           # Central route registry
├── server.ts                           # Server startup & initialization
├── types.ts                            # Global TypeScript type definitions
│
├── config/                             # 📁 Configuration Modules
│   ├── auth.ts                         # JWT & authentication configuration
│   ├── database.ts                     # Prisma client singleton & connection
│   └── env.ts                          # Environment variables validation (Zod)
│
├── db/                                 # 📁 Database Utilities
│   ├── index.ts                        # Prisma client export & re-export
│   └── seed.ts                         # Database seeding script (sample data)
│
├── generated/                          # 📁 Auto-Generated Code (DO NOT EDIT!)
│   ├── prisma/                         # Generated by Prisma
│   │   ├── browser.ts                  # Prisma browser bundle
│   │   ├── client.ts                   # Prisma Client main file
│   │   ├── commonInputTypes.ts         # Common input types
│   │   ├── enums.ts                    # Enum definitions
│   │   ├── models.ts                   # Model type definitions
│   │   ├── query_engine-windows.dll.node  # Query engine binary
│   │   ├── internal/                   # Internal Prisma files
│   │   │   └── (auto-generated files)
│   │   └── models/                     # Model-specific exports
│   │       └── (auto-generated files)
│   │
│   └── prismabox/                      # Generated by Prismabox (Typebox schemas)
│       ├── __nullable__.ts             # Nullable utility
│       ├── __transformDate__.ts        # Date transformation helper
│       ├── Account.ts                  # Account schema
│       ├── Attachment.ts               # Attachment schema
│       ├── barrel.ts                   # Barrel export file
│       ├── Departemen.ts               # Departemen schema
│       ├── DocumentType.ts             # DocumentType enum schema
│       ├── FieldType.ts                # FieldType enum schema
│       ├── Jenjang.ts                  # Jenjang enum schema
│       ├── LetterCategory.ts           # LetterCategory enum schema
│       ├── LetterDocument.ts           # LetterDocument schema
│       ├── LetterInstance.ts           # LetterInstance schema
│       ├── LetterLog.ts                # LetterLog schema
│       ├── LetterStatus.ts             # LetterStatus enum schema
│       ├── LetterTemplate.ts           # LetterTemplate schema
│       ├── LetterType.ts               # LetterType schema
│       ├── Mahasiswa.ts                # Mahasiswa schema
│       ├── Pegawai.ts                  # Pegawai schema
│       ├── Permission.ts               # Permission schema
│       ├── ProgramStudi.ts             # ProgramStudi schema
│       ├── Role.ts                     # Role schema
│       ├── RolePermission.ts           # RolePermission schema
│       ├── SavedSignature.ts           # SavedSignature schema
│       ├── Session.ts                  # Session schema
│       ├── StepStatus.ts               # StepStatus enum schema
│       ├── TemplateEngine.ts           # TemplateEngine enum schema
│       ├── User.ts                     # User schema
│       ├── UserRole.ts                 # UserRole schema
│       └── Verification.ts             # Verification schema
│
├── lib/                                # 📁 External Library Wrappers
│   ├── auth.ts                         # JWT utilities (sign, verify, decode)
│   └── casbin.ts                       # Casbin RBAC setup & enforcer
│
├── middlewares/                        # 📁 Global Middleware
│   ├── auth.ts                         # JWT verification middleware
│   └── context.ts                      # Request context middleware
│
├── modules/                            # 📁 Feature Modules (Business Logic)
│   │
│   ├── submission/                     # 📝 Module: Pengajuan Surat
│   │   ├── submission.controller.ts    # HTTP request/response handlers
│   │   ├── submission.service.ts       # Business logic layer
│   │   ├── submission.repository.ts    # Database access layer (Prisma)
│   │   ├── submission.route.ts         # Route definitions
│   │   ├── submission.validation.ts    # Zod validation schemas
│   │   └── submission.types.ts         # TypeScript types specific to module
│   │
│   ├── pengantar/                      # 📄 Module: Surat Pengantar
│   │   ├── pengantar.controller.ts     # HTTP request/response handlers
│   │   ├── pengantar.service.ts        # Business logic layer
│   │   ├── pengantar.repository.ts     # Database access layer (Prisma)
│   │   ├── pengantar.route.ts          # Route definitions
│   │   ├── pengantar.validation.ts     # Zod validation schemas
│   │   └── pengantar.types.ts          # TypeScript types specific to module
│   │
│   ├── disposisi/                      # 📮 Module: Disposisi
│   │   ├── disposisi.controller.ts     # HTTP request/response handlers
│   │   ├── disposisi.service.ts        # Business logic layer
│   │   ├── disposisi.repository.ts     # Database access layer (Prisma)
│   │   ├── disposisi.route.ts          # Route definitions
│   │   ├── disposisi.validation.ts     # Zod validation schemas
│   │   └── disposisi.types.ts          # TypeScript types specific to module
│   │
│   ├── leadership/                     # 👔 Module: Verifikasi Pimpinan
│   │   ├── leadership.controller.ts    # HTTP request/response handlers
│   │   ├── leadership.service.ts       # Business logic layer
│   │   ├── leadership.repository.ts    # Database access layer (Prisma)
│   │   ├── leadership.route.ts         # Route definitions
│   │   ├── leadership.validation.ts    # Zod validation schemas
│   │   └── leadership.types.ts         # TypeScript types specific to module
│   │
│   ├── surat-hasil/                    # ✍️ Module: Surat Hasil & Signature
│   │   ├── hasil.controller.ts         # HTTP request/response handlers
│   │   ├── hasil.service.ts            # Business logic layer
│   │   ├── hasil.repository.ts         # Database access layer (Prisma)
│   │   ├── hasil.route.ts              # Route definitions
│   │   ├── hasil.validation.ts         # Zod validation schemas
│   │   ├── hasil.types.ts              # TypeScript types specific to module
│   │   └── signature.flow.ts           # Digital signature workflow logic
│   │
│   └── legalisasi/                     # ✅ Module: Legalisasi & Distribusi
│       ├── legalisasi.controller.ts    # HTTP request/response handlers
│       ├── legalisasi.service.ts       # Business logic layer
│       ├── legalisasi.repository.ts    # Database access layer (Prisma)
│       ├── legalisasi.route.ts         # Route definitions
│       ├── legalisasi.validation.ts    # Zod validation schemas
│       └── legalisasi.types.ts         # TypeScript types specific to module
│
├── routes/                             # 📁 Route Handlers
│   ├── dash.ts                         # Dashboard routes (/api/dash/*)
│   ├── me.ts                           # Current user routes (/api/me/*)
│   │
│   ├── master/                         # 📁 Master Data CRUD Routes
│   │   ├── departemen.ts               # Departemen CRUD (/api/master/departemen)
│   │   ├── mahasiswa.ts                # Mahasiswa CRUD (/api/master/mahasiswa)
│   │   ├── pegawai.ts                  # Pegawai CRUD (/api/master/pegawai)
│   │   ├── permission.ts               # Permission CRUD (/api/master/permission)
│   │   ├── prodi.ts                    # Program Studi CRUD (/api/master/prodi)
│   │   ├── role.ts                     # Role CRUD (/api/master/role)
│   │   ├── user.ts                     # User CRUD (/api/master/user)
│   │   ├── surat-type.ts               # Letter Type CRUD (/api/master/surat-type)
│   │   └── surat-template.ts           # Letter Template CRUD (/api/master/surat-template)
│   │
│   └── public/                         # 📁 Public Routes (No Auth)
│       ├── auth.ts                     # Authentication routes (login, register)
│       └── sso.ts                      # SSO callback routes
│
├── services/                           # 📁 External Service Integrations
│   ├── locks.ts                        # Distributed locks service
│   ├── minio.service.ts                # MinIO file storage service (S3-compatible)
│   │
│   └── database_models/                # 📁 Auto-Generated CRUD Services (Optional)
│       ├── user.service.ts             # User CRUD operations
│       ├── role.service.ts             # Role CRUD operations
│       └── (other model services)
│
└── shared/                             # 🔴 Shared Resources (ZONA MERAH!)
    │
    ├── constants/                      # 📁 Global Constants
    │   ├── http-status.ts              # HTTP status codes & messages
    │   ├── error-messages.ts           # Standardized error messages
    │   ├── roles.ts                    # User role definitions
    │   └── permissions.ts              # Permission definitions
    │
    ├── middleware/                     # 📁 Reusable Middleware
    │   ├── error-handler.ts            # Global error handling middleware
    │   ├── logger.ts                   # Request/response logging middleware
    │   ├── rate-limit.ts               # Rate limiting middleware
    │   ├── validator.ts                # Generic Zod validation middleware
    │   └── cors.ts                     # CORS configuration middleware
    │
    ├── types/                          # 📁 Shared TypeScript Types
    │   ├── api.ts                      # API request/response types
    │   ├── auth.ts                     # Authentication-related types
    │   ├── pagination.ts               # Pagination types
    │   ├── filter.ts                   # Query filter types
    │   └── common.ts                   # Common utility types
    │
    └── utils/                          # 📁 Utility Functions
        ├── response.ts                 # Standardized API response formatter
        ├── date.ts                     # Date manipulation helpers
        ├── string.ts                   # String utilities (slugify, capitalize, etc)
        ├── pagination.ts               # Pagination calculation helpers
        ├── validator.ts                # Custom validation functions
        ├── crypto.ts                   # Cryptography utilities (hash, encrypt)
        └── file.ts                     # File handling utilities
