/**
 * Template Surat Keputusan Dekan FSM UNDIP
 * Digunakan untuk generate PDF dengan data lengkap
 */

export interface SignatureBlock {
  signerRole: string;
  signerName: string;
  signerNip?: string;
  signatureUrl?: string;
  signedAt?: string;
  prefix?: string; // Awalan seperti "Mengetahui,"
}

export interface PesertaData {
  nama: string;
  nim: string;
}

export interface KeputusanItem {
  label: string;
  content: string;
}

// Tembusan recipient for display in letter
// userId kosong = tembusan text (tampil di surat)
// userId terisi = tembusan user (hanya untuk akses sistem, tidak tampil di surat)
export interface TembusanRecipient {
  userId?: string;        // Jika ada, tembusan ini hanya untuk akses sistem
  name: string;
  description?: string;
}

export interface SuratKeputusanData {
  nomorSurat: string;
  tentang: string;
  menimbang: string[];
  mengingat: string[];
  menetapkan: string;
  keputusan: KeputusanItem[];
  tanggalDitetapkan: string;
  lampiran?: boolean;
  dataPeserta?: PesertaData[];
  signatures?: SignatureBlock[];
  qrCodeDataUrl?: string;
  verificationUrl?: string;
  stempelUrl?: string;
  tembusan?: TembusanRecipient[];
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
      <p style="margin: 0 0 5px 0; color: #000000 !important;">${signature.signerRole}</p>
      ${signatureImage}
      ${stempelOverlay}
      <p style="margin: 5px 0 0 0; font-weight: bold; text-decoration: underline; color: #000000 !important;">${signature.signerName}</p>
      ${signature.signerNip ? `<p style="margin: 2px 0 0 0; font-size: 10pt; color: #000000 !important;">NIP. ${signature.signerNip}</p>` : ''}
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
    return `
      <div class="ttd-count-1">
        <p class="ttd-text" style="color: white"></p>
        <p class="ttd-text" style="color: white"></p>
        <p class="nama-pejabat" style="color: white"></p>
        <p class="ttd-text" style="color: white"></p>
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
    <div class="qr-code-container" style="position: fixed; bottom: 20px; right: 20px; text-align: center; background: white; padding: 5px; z-index: 1000;">
      <img src="${qrCodeDataUrl}" alt="QR Code Verifikasi" style="width: 80px; height: 80px;" />
      <p style="margin: 2px 0 0 0; font-size: 6pt; color: #666666 !important;">Scan untuk verifikasi</p>
    </div>
  `;
};

/**
 * Render tembusan section below the signature block
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

  const recipients = textBasedTembusan
    .map((t, index) => {
      const desc = t.description ? ` (${t.description})` : '';
      return `<li style="color: #000000 !important; margin-bottom: 2px;">${index + 1}. ${t.name}${desc}</li>`;
    })
    .join('\n');

  // Tembusan menggunakan static position, berada di bawah tanda tangan
  return `
    <div class="tembusan-container">
      <p style="margin: 0 0 5px 0; color: #000000 !important; font-weight: bold; font-size: 11pt;">Tembusan:</p>
      <ul style="margin: 0; padding-left: 20px; color: #000000 !important; font-size: 10pt; line-height: 1.4; list-style: none;">
        ${recipients}
      </ul>
    </div>
  `;
};

export const suratKeputusanTemplate = (data: SuratKeputusanData): string => `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Surat Keputusan Dekan - FSM UNDIP</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    html, body {
      width: 21cm;
      min-height: 29.7cm;
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
      font-size: 11pt;
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
    .logo-container {
      text-align: center;
      margin-bottom: 20px;
    }
    .logo {
      width: 80px;
      height: auto;
    }
    .judul-keputusan {
      text-align: center;
      margin-bottom: 25px;
      line-height: 1.4;
    }
    .judul-keputusan h4 {
      margin: 3px 0;
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
    }
    .judul-keputusan p {
      margin: 3px 0;
      font-size: 11pt;
    }
    .tentang {
      text-align: center;
      margin: 20px 0;
      text-transform: uppercase;
    }
    .section-title {
      margin-top: 20px;
      margin-bottom: 10px;
      text-align: center;
    }
    .content-section {
      text-align: justify;
      margin: 15px 0;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .section-header {
      display: flex;
      align-items: flex-start;
      max-width: 100%;
    }
    .section-label {
      min-width: 120px;
      flex-shrink: 0;
    }
    .section-colon {
      min-width: 20px;
      flex-shrink: 0;
    }
    .section-content {
      flex: 1;
      min-width: 0;
      max-width: calc(100% - 140px);
      word-wrap: break-word;
      overflow-wrap: break-word;
      word-break: break-all;
      box-sizing: border-box;
    }
    .point-list {
      margin-left: 0;
    }
    .point-item {
      display: flex;
      margin-bottom: 10px;
      text-align: justify;
    }
    .point-number {
      min-width: 25px;
      flex-shrink: 0;
    }
    .point-content {
      flex: 1;
      min-width: 0;
      text-align: justify;
      word-wrap: break-word;
      overflow-wrap: break-word;
      word-break: break-all;
    }
    .keputusan-section {
      margin: 20px 0;
      max-width: 100%;
    }
    .keputusan-point {
      margin: 15px 0;
      max-width: 100%;
    }
    .keputusan-label {
      margin-bottom: 5px;
      text-transform: uppercase;
      word-wrap: break-word;
      overflow-wrap: break-word;
      box-sizing: border-box;
    }
    .keputusan-content {
      margin-left: 100px;
      text-align: justify;
      word-wrap: break-word;
      overflow-wrap: break-word;
      box-sizing: border-box;
    }
    .table-peserta {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    .table-peserta th,
    .table-peserta td {
      border: 1px solid #000000;
      padding: 6px 8px;
      font-size: 10pt;
    }
    .table-peserta th {
      background-color: #d3d3d3;
      font-weight: bold;
      text-align: center;
    }
    .table-peserta td:first-child {
      text-align: center;
      width: 5%;
    }
    .table-peserta td:nth-child(2) {
      width: 60%;
    }
    .table-peserta td:nth-child(3) {
      text-align: center;
      width: 35%;
    }
    .ttd-section {
      margin-top: 40px;
      page-break-inside: avoid;
      clear: both;
    }
    
    /* 1 TTD → kanan bawah */
    .ttd-count-1 {
      display: flex;
      justify-content: flex-end;
    }

    /* 2 TTD → kiri & kanan (yang lebih tinggi di kanan) */
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

    .signature-block {
      display: inline-block;
      text-align: center;
      min-width: 200px;
    }
    .ttd-text {
      margin: 3px 0;
    }
    .nama-pejabat {
      margin-top: 60px;
      font-weight: normal;
      text-decoration: underline;
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
    .tembusan-container {
      margin-top: 40px;
      max-width: 300px;
      font-size: 11pt;
      line-height: 1.4;
      position: static;
      page-break-inside: avoid;
    }
    @media print {
      .qr-code-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
      }
      .tembusan-container {
        position: static;
      }
    }
    b, strong {
      font-weight: bold !important;
    }
  </style>
</head>
<body>
  <div class="logo-container">
    <img src="${data.logoUrl || DEFAULT_LOGO_URL}" alt="Logo UNDIP" class="logo">
  </div>
  
  <div class="judul-keputusan">
    <h4>KEPUTUSAN DEKAN FAKULTAS SAINS DAN MATEMATIKA</h4>
    <h4>UNIVERSITAS DIPONEGORO</h4>
    <p><b>NOMOR : ${data.nomorSurat}</b></p>
  </div>
  
  <div class="tentang">
    <p><b>TENTANG</b></p>
    <p style="font-style: italic;">${data.tentang}</p>
  </div>
  
  <div class="section-title">
    <p>DEKAN FAKULTAS SAINS DAN MATEMATIKA</p>
  </div>
  
  <div class="content-section">
    <div class="section-header">
      <div class="section-label">Menimbang</div>
      <div class="section-colon">:</div>
      <div class="section-content">
        <div class="point-list">
          ${data.menimbang
            .map(
              (item, index) => `
          <div class="point-item">
            <div class="point-number">${String.fromCharCode(97 + index)}.</div>
            <div class="point-content">${item}</div>
          </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>
  </div>
  
  <div class="content-section">
    <div class="section-header">
      <div class="section-label">Mengingat</div>
      <div class="section-colon">:</div>
      <div class="section-content">
        <div class="point-list">
          ${data.mengingat
            .map(
              (item, index) => `
          <div class="point-item">
            <div class="point-number">${index + 1}.</div>
            <div class="point-content">${item}</div>
          </div>
          `
            )
            .join('')}
        </div>
      </div>
    </div>
  </div>
  
  <div class="section-title">
    <p>MEMUTUSKAN</p>
  </div>
  
  <div class="content-section">
    <div class="section-header">
      <div class="section-label">Menetapkan</div>
      <div class="section-colon">:</div>
      <div class="section-content">
        <p style="margin: 0; text-align: justify;">${data.menetapkan}</p>
      </div>
    </div>
  </div>
  
  <div class="keputusan-section">
    ${data.keputusan
      .map(
        (item) => `
    <div class="keputusan-point">
      <div style="display: flex; align-items: flex-start; max-width: 100%;">
        <div style="min-width: 120px; flex-shrink: 0;"><span class="keputusan-label">${item.label}</span></div>
        <div style="min-width: 20px; flex-shrink: 0;">:</div>
        <div style="flex: 1; min-width: 0; max-width: calc(100% - 140px); text-align: justify; word-wrap: break-word; overflow-wrap: break-word; word-break: break-all;">${item.content}</div>
      </div>
    </div>
    `
      )
      .join('')}
  </div>
  
  <div class="tanggal-ditetapkan" style="text-align: right; margin-top: 30px; margin-bottom: 20px;">
    <p style="margin: 0;">Ditetapkan di Semarang</p>
    <p style="margin: 0;">pada tanggal ${data.tanggalDitetapkan}</p>
  </div>
  
  <div class="ttd-section">
    ${renderSignatures(data.signatures, data.stempelUrl)}
  </div>
  ${renderTembusan(data.tembusan)}
  ${renderQRCode(data.qrCodeDataUrl)}
  
  ${
    data.lampiran && data.dataPeserta
      ? `
  <div style="page-break-before: always; margin-top: 50px;">
    <div class="content-section">
      <div class="section-header">
        <div class="section-label">LAMPIRAN:</div>
        <div class="section-content">
          <div class="point-item">
            <div class="point-content">KEPUTUSAN DEKAN FAKULTAS SAINS DAN MATEMATIKA UNIVERSITAS DIPONEGORO</div>
          </div>
          <div class="point-item">
            <div class="point-content">NOMOR : ${data.nomorSurat}</div>
          </div>
          <div class="point-item">
            <div class="point-content">TENTANG</div>
          </div>
          <div class="point-item">
            <div class="point-content">${data.tentang}</div>
          </div>
        </div>
      </div>
    </div>
    
    <p style="text-align: left; margin: 20px 0;">Panitia</p>
    
    <table class="table-peserta">
      <thead>
        <tr>
          <th>No</th>
          <th>Nama</th>
          <th>NIM</th>
        </tr>
      </thead>
      <tbody>
        ${data.dataPeserta
          .map(
            (peserta, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${peserta.nama}</td>
          <td>${peserta.nim}</td>
        </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
    
    <div class="ttd-section">
      ${renderSignatures(data.signatures, data.stempelUrl)}
    </div>
  </div>
  `
      : ''
  }
</body>
</html>`;