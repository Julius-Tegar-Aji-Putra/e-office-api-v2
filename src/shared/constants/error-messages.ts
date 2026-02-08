/**
 * Error Messages - Standardized error messages for E-Office
 * Sesuai dengan Prompting.md status mapping
 */

export const ERROR_MESSAGES = {
  // Authentication & Authorization
  AUTH: {
    INVALID_TOKEN: 'Token tidak valid atau sudah kadaluarsa',
    EXPIRED_TOKEN: 'Sesi telah berakhir, silakan masuk kembali',
    UNAUTHORIZED: 'Anda tidak memiliki akses',
    FORBIDDEN: 'Akses ditolak untuk aksi ini',
    LOGIN_REQUIRED: 'Silakan masuk terlebih dahulu',
    INVALID_CREDENTIALS: 'Email atau password salah',
  },

  // Letter Submission
  SUBMISSION: {
    NOT_FOUND: 'Surat tidak ditemukan',
    ALREADY_EXISTS: 'Pengajuan dengan data yang sama sudah ada',
    INVALID_TYPE: 'Jenis surat tidak valid',
    MISSING_REQUIRED_FIELDS: 'Data wajib belum lengkap',
    ATTACHMENT_REQUIRED: 'Lampiran wajib harus diunggah',
    INVALID_STATUS_TRANSITION: 'Perubahan status tidak valid',
  },

  // Approval & Verification
  APPROVAL: {
    ALREADY_APPROVED: 'Surat sudah disetujui sebelumnya',
    ALREADY_REJECTED: 'Surat sudah ditolak sebelumnya',
    CANNOT_APPROVE_OWN: 'Tidak dapat menyetujui surat sendiri',
    NOT_YOUR_TURN: 'Bukan giliran Anda untuk memproses surat ini',
    REASON_REQUIRED: 'Alasan wajib diisi',
  },

  // Disposition
  DISPOSITION: {
    INVALID_TARGET: 'Target disposisi tidak valid',
    CANNOT_DISPOSITION_UP: 'Tidak dapat disposisi ke jabatan lebih tinggi',
    ALREADY_DISPOSED: 'Surat sudah didisposisikan',
    CATEGORY_REQUIRED: 'Jenis surat (Akademik/Sumber Daya/Umum) harus dipilih',
  },

  // Drafting
  DRAFT: {
    CANNOT_EDIT: 'Draft tidak dapat diedit pada status ini',
    TEMPLATE_NOT_FOUND: 'Template surat tidak ditemukan',
    CONTENT_REQUIRED: 'Isi surat wajib diisi',
    ALREADY_SUBMITTED: 'Draft sudah diajukan untuk verifikasi',
  },

  // Signature
  SIGNATURE: {
    NOT_YOUR_TURN_TO_SIGN: 'Bukan giliran Anda untuk menandatangani',
    ALREADY_SIGNED: 'Anda sudah menandatangani dokumen ini',
    SIGNATURE_REQUIRED: 'Tanda tangan diperlukan',
    INVALID_SIGNATURE: 'Format tanda tangan tidak valid',
    PREVIOUS_SIGNER_PENDING: 'Menunggu tanda tangan sebelumnya',
  },

  // UPA
  UPA: {
    NUMBER_EXISTS: 'Nomor surat sudah digunakan',
    NUMBER_REQUIRED: 'Nomor surat wajib diisi',
    DATE_REQUIRED: 'Tanggal surat wajib diisi',
    NOT_READY_FOR_NUMBERING: 'Surat belum siap untuk penomoran',
    STAMP_FAILED: 'Gagal membubuhkan stempel',
  },

  // General
  GENERAL: {
    NOT_FOUND: 'Data tidak ditemukan',
    INVALID_INPUT: 'Input tidak valid',
    INTERNAL_ERROR: 'Terjadi kesalahan internal, silakan coba lagi',
    RATE_LIMIT_EXCEEDED: 'Terlalu banyak permintaan, coba lagi nanti',
    FILE_TOO_LARGE: 'Ukuran file terlalu besar',
    INVALID_FILE_TYPE: 'Tipe file tidak didukung',
  },
} as const;

/**
 * Success Messages
 */
export const SUCCESS_MESSAGES = {
  SUBMISSION: {
    CREATED: 'Pengajuan surat berhasil dibuat',
    UPDATED: 'Pengajuan berhasil diperbarui',
    DELETED: 'Pengajuan berhasil dihapus',
  },
  
  APPROVAL: {
    APPROVED: 'Surat berhasil disetujui',
    REJECTED: 'Surat berhasil ditolak',
    RETURNED: 'Surat berhasil dikembalikan',
  },

  DISPOSITION: {
    SUCCESS: 'Disposisi berhasil dikirim',
    COMPLETED: 'Surat dinyatakan selesai',
  },

  DRAFT: {
    CREATED: 'Draft surat berhasil dibuat',
    UPDATED: 'Draft berhasil diperbarui',
    SUBMITTED: 'Draft berhasil diajukan untuk verifikasi',
  },

  SIGNATURE: {
    SIGNED: 'Dokumen berhasil ditandatangani',
    SAVED: 'Tanda tangan berhasil disimpan',
  },

  UPA: {
    NUMBERED: 'Penomoran surat berhasil',
    STAMPED: 'Stempel berhasil dibubuhkan',
    FINALIZED: 'Surat berhasil diterbitkan',
  },

  GENERAL: {
    SUCCESS: 'Berhasil',
    SAVED: 'Data berhasil disimpan',
    DELETED: 'Data berhasil dihapus',
  },
} as const;
