/**
 * Template Surat Tugas FSM UNDIP
 * Digunakan untuk generate PDF dengan data lengkap
 */

export interface SignatureBlock {
  signerRole: string;
  signerName: string;
  signerNip?: string;
  signatureUrl?: string;
  signedAt?: string;
  prefix?: string; // Awalan tanda tangan, e.g., "Mengetahui,", "Menyetujui,"
}

// Tembusan recipient for display in letter
// userId kosong = tembusan text (tampil di surat)
// userId terisi = tembusan user (hanya untuk akses sistem, tidak tampil di surat)
export interface TembusanRecipient {
  userId?: string;        // Jika ada, tembusan ini hanya untuk akses sistem
  name: string;
  description?: string;
}

export interface SuratTugasData {
  jenisSurat: 'tugas' | 'keputusan';
  jenisSuratText: string;
  nomorSurat: string;
  namaLengkap: string;
  nimNip: string;
  programStudi: string;
  keperluan: string;
  judulSurat: string;
  signatures?: SignatureBlock[];
  tanggalSurat?: string;
  qrCodeDataUrl?: string;
  verificationUrl?: string;
  stempelUrl?: string; // URL stempel UNDIP
  tembusan?: TembusanRecipient[]; // List of tembusan recipients
  logoUrl?: string; // URL atau base64 data URL logo UNDIP
}

// Default logo URL (fallback jika logoUrl tidak disediakan)
const DEFAULT_LOGO_URL = 'https://mm.feb.undip.ac.id/wp-content/uploads/2021/11/universitas-diponegoro-logo.png';

/**
 * Get hierarchy rank for a signer role
 * Higher rank = higher authority
 * Dekan = 3 (highest), Wadek 1 = 2, Wadek 2 = 1
 */
const getHierarchyRank = (role: string): number => {
  const upperRole = role.toUpperCase();
  if (upperRole.includes('DEKAN') && !upperRole.includes('WAKIL')) return 3; // Dekan = tertinggi
  if (upperRole.includes('WAKIL') && upperRole.includes('1')) return 2; // Wadek 1
  if (upperRole.includes('WAKIL') && upperRole.includes('2')) return 1; // Wadek 2
  if (upperRole.includes('WADEK') && upperRole.includes('1')) return 2;
  if (upperRole.includes('WADEK') && upperRole.includes('2')) return 1;
  return 0;
};

/**
 * Find the role that should receive the stempel overlay
 * Priority: Dekan > Wadek 1 > Wadek 2
 * If Dekan exists, stempel goes to Dekan
 * If only Wadek 1 and Wadek 2, stempel goes to Wadek 1
 * If only Wadek 2, stempel goes to Wadek 2
 */
const findStempelRecipientRole = (signatures: SignatureBlock[]): string | null => {
  if (!signatures || signatures.length === 0) return null;
  
  let highestRank = 0;
  let stempelRecipientRole: string | null = null;
  
  for (const sig of signatures) {
    const rank = getHierarchyRank(sig.signerRole);
    if (rank > highestRank) {
      highestRank = rank;
      stempelRecipientRole = sig.signerRole;
    }
  }
  
  return stempelRecipientRole;
};

/**
 * Convert internal role code to display label
 */
const getRoleDisplayLabel = (role: string): string => {
  const ROLE_LABELS: Record<string, string> = {
    'DEKAN': 'Dekan',
    'WADEK_1': 'Wakil Dekan I',
    'WADEK_2': 'Wakil Dekan II',
    'KADEP': 'Ketua Departemen',
    'KAPRODI': 'Ketua Program Studi',
  };
  return ROLE_LABELS[role] || role;
};

const renderSignatureBlock = (signature: SignatureBlock, stempelUrl?: string, shouldHaveStempel = false): string => {
  const signatureImage = signature.signatureUrl 
    ? `<img src="${signature.signatureUrl}" alt="Tanda Tangan" style="max-width: 120px; max-height: 60px; object-fit: contain;" />`
    : '<div style="height: 60px;"></div>';
  
  // Stempel overlay untuk jabatan tertinggi yang ada di surat
  const stempelOverlay = shouldHaveStempel && stempelUrl ? `
    <div style="position: absolute; top: 15px; left: 50%; transform: translateX(-50%); width: 80px; height: 80px; opacity: 0.85; z-index: 5;">
      <img src="${stempelUrl}" alt="Stempel" style="width: 100%; height: 100%; object-fit: contain;" />
    </div>
  ` : '';
  
  return `
    <div class="signature-block" style="text-align: center; min-width: 200px; position: relative;">
      ${signature.prefix ? `<p style="margin: 0 0 5px 0; font-style: italic; color: #000000 !important;">${signature.prefix}</p>` : ''}
      <p style="margin: 0 0 5px 0; color: #000000 !important;">${getRoleDisplayLabel(signature.signerRole)}</p>
      ${signatureImage}
      ${stempelOverlay}
      <p style="margin: 5px 0 0 0; color: #000000 !important; font-weight: bold; text-decoration: underline;">${signature.signerName}</p>
      ${signature.signerNip ? `<p style="margin: 2px 0 0 0; color: #000000 !important; font-size: 10pt;">NIP. ${signature.signerNip}</p>` : ''}
    </div>
  `;
};

/**
 * Sort signatures by hierarchy: Wadek 2 (lowest), Wadek 1, Dekan (highest)
 * For 3 signatures layout: top-left (Wadek2), top-right (Wadek1), bottom-center (Dekan)
 */
const sortSignaturesByHierarchy = (signatures: SignatureBlock[]): SignatureBlock[] => {
  if (signatures.length !== 3) return signatures;
  
  const sorted = [...signatures].sort((a, b) => getHierarchyRank(a.signerRole) - getHierarchyRank(b.signerRole));
  
  // Layout: [0] = Wadek2 (top-left), [1] = Wadek1 (top-right), [2] = Dekan (bottom-center)
  return sorted;
};

const renderSignatures = (signatures?: SignatureBlock[], stempelUrl?: string): string => {
  if (!signatures || signatures.length === 0) {
    // Placeholder TTD dengan warna putih (tidak terlihat) untuk draft
    return `
      <div class="ttd-count-1">
        <div class="ttd-box" style="visibility: hidden;">
          <p style="color: #ffffff;"></p>
          <p style="color: #ffffff;"></p>
          <p class="nama-pejabat" style="color: #ffffff;"></p>
          <p style="color: #ffffff;"></p>
        </div>
      </div>
    `;
  }
  
  // Sort signatures by hierarchy for proper layout
  const sortedSignatures = sortSignaturesByHierarchy(signatures);
  
  // Find which signature should receive the stempel (highest ranking)
  const stempelRecipientRole = findStempelRecipientRole(signatures);
  
  const count = sortedSignatures.length;
  const countClass = `ttd-count-${Math.min(count, 4)}`;
  const signatureBlocks = sortedSignatures.map(sig => {
    const shouldHaveStempel = sig.signerRole === stempelRecipientRole;
    return renderSignatureBlock(sig, stempelUrl, shouldHaveStempel);
  }).join('');
  
  return `<div class="${countClass}">${signatureBlocks}</div>`;
};

const renderQRCode = (qrCodeDataUrl?: string): string => {
  if (!qrCodeDataUrl) return '';
  
  return `
    <div class="qr-code-container" style="position: fixed; bottom: 20px; right: 20px; text-align: center; background: white; padding: 5px;">
      <img src="${qrCodeDataUrl}" alt="QR Code Verifikasi" style="width: 100px; height: 100px;" />
    </div>
  `;
};

const renderStempel = (stempelUrl?: string): string => {
  if (!stempelUrl) return '';
  
  return `
    <div class="stempel-container" style="position: absolute; bottom: 120px; right: 180px; width: 80px; height: 80px; opacity: 0.85;">
      <img src="${stempelUrl}" alt="Stempel UNDIP" style="width: 100%; height: 100%; object-fit: contain;" />
    </div>
  `;
};

/**
 * Render tembusan section at bottom left of the letter, above QR code
 * Hanya menampilkan tembusan text (userId kosong)
 * Tembusan user (userId terisi) hanya untuk akses sistem, tidak ditampilkan di surat
 * Mendukung format lama (string[]) dan format baru (TembusanRecipient[])
 */
const renderTembusan = (tembusan?: (TembusanRecipient | string)[]): string => {
  if (!tembusan || tembusan.length === 0) return '';
  
  // Normalize: convert to TembusanRecipient format
  const normalizedTembusan: TembusanRecipient[] = tembusan.map(t => {
    if (typeof t === 'string') {
      // Old format: string - convert to object
      return { userId: '', name: t, description: '' };
    }
    return t;
  });
  
  // Filter: hanya tampilkan tembusan yang userId-nya kosong (text-based)
  // Tembusan dengan userId = untuk akses sistem saja, tidak ditampilkan di surat
  const textBasedTembusan = normalizedTembusan.filter(t => !t.userId || t.userId === '');
  
  if (textBasedTembusan.length === 0) return '';
  
  // Calculate bottom position based on number of tembusan items
  // More items = higher position to stay above QR
  const itemCount = textBasedTembusan.length;
  const baseBottom = 110; // Base position above QR code
  const additionalHeight = Math.max(0, (itemCount - 2) * 18); // 18px per extra item
  const bottomPosition = baseBottom + additionalHeight;
  
  return `
    <div class="tembusan-container" style="position: fixed; bottom: ${bottomPosition}px; left: 60px; max-width: 280px; z-index: 100; background: white;">
      <p style="margin: 0 0 5px 0; font-size: 11pt; font-weight: bold; color: #000000 !important;">Tembusan:</p>
      <ol style="margin: 0; padding-left: 20px; font-size: 10pt; color: #000000 !important; line-height: 1.4;">
        ${textBasedTembusan.map(t => `
          <li style="color: #000000 !important; margin-bottom: 2px;">
            ${t.name}${t.description ? ` (${t.description})` : ''}
          </li>
        `).join('')}
      </ol>
    </div>
  `;
};

export const suratTugasTemplate = (data: SuratTugasData): string => `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.jenisSuratText} - FSM UNDIP</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      box-sizing: border-box;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.6;
      margin: 0;
      padding: 50px 60px 100px 60px;
      width: 210mm;
      min-height: 297mm;
      color: #000000 !important;
      background: #ffffff !important;
      position: relative;
      word-wrap: break-word;
      overflow-wrap: break-word;
      box-sizing: border-box;
    }
    .header-container {
      display: flex;
      align-items: flex-start;
      padding-bottom: 10px;
      margin-bottom: 5px;
    }
    .logo-container {
      width: 12%;
      text-align: left;
    }
    .logo {
      width: 75px;
      height: auto;
    }
    .kop-surat {
      width: 53%;
      text-align: left;
      padding-left: 15px;
    }
    .kop-surat h3 {
      margin: 0;
      font-size: 10pt;
      font-weight: normal;
      letter-spacing: 0.3px;
      line-height: 1.3;
      color: #3e4ba8 !important;
    }
    .kop-surat h2 {
      margin: 2px 0;
      font-size: 13pt;
      color: #3e4ba8 !important;
      font-weight: bold;
      line-height: 1.2;
    }
    .alamat-kontak {
      width: 35%;
      text-align: right;
      font-size: 6.5pt;
      color: #3e4ba8 !important;
    }
    .alamat-kontak p {
      color: #3e4ba8 !important;
      line-height: 1.4;
    }
    .judul-surat {
      text-align: center;
      margin-top: 30px;
      margin-bottom: 25px;
    }
    .judul-surat h4 {
      margin: 0;
      text-decoration: underline;
      font-size: 12pt;
      font-weight: bold;
    }
    .judul-surat p {
      margin: 8px 0 0 0;
      font-size: 11pt;
    }
    .isi-surat {
      text-align: justify;
      margin: 15px 0;
      text-indent: 40px;
      line-height: 1.5;
      word-wrap: break-word;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .penutup {
      margin: 15px 0;
      text-indent: 40px;
      text-align: justify;
    }
    .ttd-container {
      margin-top: 30px;
      page-break-inside: avoid;
      clear: both;
    }
    
    /* 1 TTD → kanan */
    .ttd-count-1 {
      display: flex;
      justify-content: flex-end;
    }

    /* 2 TTD → kiri & kanan */
    .ttd-count-2 {
      display: flex;
      justify-content: space-between;
    }

    /* 3 TTD: Wadek1 kiri atas, Dekan kanan atas, Wadek2 bawah tengah */
    .ttd-count-3 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-areas:
        "t1 t2"
        "t3 t3";
      gap: 30px;
    }

    .ttd-count-3 .signature-block:nth-child(1) {
      grid-area: t1;
      justify-self: start;
    }

    .ttd-count-3 .signature-block:nth-child(2) {
      grid-area: t2;
      justify-self: end;
    }

    .ttd-count-3 .signature-block:nth-child(3) {
      grid-area: t3;
      justify-self: center;
    }

    /* 4 TTD → grid 2x2 */
    .ttd-count-4 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }
    
    .ttd-box {
      text-align: center;
      min-width: 200px;
    }
    .signature-block {
      text-align: center;
      min-width: 200px;
    }
    .ttd-box p {
      margin: 3px 0;
      color: #000000 !important;
    }
    .nama-pejabat {
      margin-top: 70px !important;
      font-weight: normal;
      color: #000000 !important;
    }
    .qr-code-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      text-align: center;
      background: white;
      padding: 5px;
      z-index: 1000;
    }
    .stempel-container {
      position: absolute;
      bottom: 20px;
      right: 100px;
      z-index: 100;
    }
    .tembusan-container {
      margin-top: 30px;
      max-width: 280px;
      page-break-inside: avoid;
    }
    .tembusan-container ol {
      list-style-type: decimal;
    }
    .tembusan-container li {
      margin-bottom: 2px;
    }
    b, strong {
      font-weight: bold !important;
      color: #000000 !important;
    }
    p, td, th, div, span, h1, h2, h3, h4, h5, h6 {
      color: #000000 !important;
    }
    table {
      color: #000000 !important;
    }
  </style>
</head>
<body style="color: #000000;">
  <div class="header-container">
    <div class="logo-container">
      <img src="${data.logoUrl || DEFAULT_LOGO_URL}" alt="Logo UNDIP" class="logo">
    </div>
    <div class="kop-surat">
      <h3 style="color: #000000;">KEMENTERIAN PENDIDIKAN TINGGI, SAINS,<br>DAN TEKNOLOGI</h3>
      <h2 style="color: #3e4ba8;">UNIVERSITAS DIPONEGORO</h2>
      <h2 style="color: #3e4ba8;">FAKULTAS SAINS DAN MATEMATIKA</h2>
    </div>
    <div class="alamat-kontak">
      <p style="color: #000000;">Jalan Prof. Sudarto, S.H Tembalang Semarang<br>
         Kode Pos 50275<br>
         Telp (024) 7474754 Fax (024) 76480690<br>
         Laman https://fsm.undip.ac.id<br>
         e-mail fsm@undip.ac.id</p>
    </div>
  </div>
  <div class="judul-surat">
    <h4 style="color: #000000;">${data.jenisSuratText}</h4>
    <p style="color: #000000;">Nomor : ${data.nomorSurat || '-'}</p>
  </div>
  <div class="isi-surat">
    <p style="color: #000000;">
      Dekan Fakultas Sains dan Matematika Universitas Diponegoro dengan ini ${data.jenisSurat === 'keputusan' ? 'memutuskan' : 'menugaskan'} kepada yang nama-namanya tercantum di bawah ini:
    </p>
    <table style="margin: 20px 0 20px 50px; width: calc(100% - 50px); color: #000000;">
      <tr>
        <td style="width: 150px; vertical-align: top; padding: 5px 0; color: #000000;">Nama</td>
        <td style="width: 20px; vertical-align: top; padding: 5px 0; color: #000000;">:</td>
        <td style="vertical-align: top; padding: 5px 0; color: #000000;">${data.namaLengkap}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 5px 0; color: #000000;">NIM/NIP</td>
        <td style="vertical-align: top; padding: 5px 0; color: #000000;">:</td>
        <td style="vertical-align: top; padding: 5px 0; color: #000000;">${data.nimNip}</td>
      </tr>
      <tr>
        <td style="vertical-align: top; padding: 5px 0; color: #000000;">Program Studi</td>
        <td style="vertical-align: top; padding: 5px 0; color: #000000;">:</td>
        <td style="vertical-align: top; padding: 5px 0; text-transform: capitalize; color: #000000;">${data.programStudi}</td>
      </tr>
    </table>
    <p style="text-indent: 50px; color: #000000;">
      Untuk <b style="color: #000000; font-weight: bold;">${data.keperluan}</b> terkait <b style="color: #000000; font-weight: bold;">${data.judulSurat}</b> pada Fakultas Sains dan Matematika Universitas Diponegoro.
    </p>
  </div>
  <div class="penutup">
    <p style="color: #000000;">Demikian surat ${data.jenisSurat === 'keputusan' ? 'keputusan' : 'tugas'} ini dibuat untuk dapat dipergunakan sebagaimana mestinya.</p>
  </div>
  ${data.tanggalSurat ? `<p style="text-align: right; margin-top: 30px; color: #000000 !important;">${data.tanggalSurat}</p>` : ''}
  <div class="ttd-container">
    ${renderSignatures(data.signatures, data.stempelUrl)}
  </div>
  ${renderTembusan(data.tembusan)}
  ${renderQRCode(data.qrCodeDataUrl)}
</body>
</html>`;
