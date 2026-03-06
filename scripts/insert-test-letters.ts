/**
 * Script untuk insert surat test yang sudah siap di Admin Fakultas
 * (status: SURAT_PENGANTAR_SIGNED, sudah ada dokumen surat pengantar yang ditandatangani)
 *
 * Jalankan: bun run scripts/insert-test-letters.ts
 */

import { PrismaClient } from '../src/generated/prisma/client';
import {
  LetterStatus,
  DocumentType,
  LogAction,
  Priority,
  SignatureStatus,
} from '../src/generated/prisma/enums';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Inserting test letters...\n');

  // 1. Cari letter type ST (Surat Tugas)
  const letterTypeST = await prisma.letterType.findFirst({ where: { code: 'ST' } });
  const letterTypeSK = await prisma.letterType.findFirst({ where: { code: 'SK' } });

  if (!letterTypeST || !letterTypeSK) {
    console.error('❌ Letter types ST/SK not found. Run db seed first.');
    return;
  }

  // 2. Cari beberapa mahasiswa sebagai pengaju
  const mahasiswaList = await prisma.user.findMany({
    where: {
      userRoles: { some: { role: { name: 'MAHASISWA' } } },
    },
    include: {
      mahasiswa: { include: { programStudi: true, departemen: true } },
    },
    take: 10,
  });

  if (mahasiswaList.length === 0) {
    console.error('❌ No mahasiswa found. Run db seed first.');
    return;
  }

  // 3. Cari dosen sebagai pengaju juga
  const dosenList = await prisma.user.findMany({
    where: {
      userRoles: { some: { role: { name: 'DOSEN' } } },
    },
    include: {
      pegawai: { include: { programStudi: true, departemen: true } },
    },
    take: 7,
  });

  // 4. Cari admin prodi informatika dan kadep informatika untuk surat pengantar
  const adminProdiIf = await prisma.user.findFirst({
    where: { email: 'admin.s1.informatika@fsm.undip.ac.id' },
  });
  const kadepIf = await prisma.user.findFirst({
    where: { email: 'kadep.informatika@fsm.undip.ac.id' },
    include: { pegawai: true },
  });

  // Cari kadep per departemen
  const kadepMap: Record<string, { id: string; name: string; nip: string }> = {};
  const kadepUsers = await prisma.user.findMany({
    where: { userRoles: { some: { role: { name: 'KADEP' } } } },
    include: { pegawai: { include: { departemen: true } } },
  });
  for (const k of kadepUsers) {
    if (k.pegawai?.departemen) {
      kadepMap[k.pegawai.departemen.code] = {
        id: k.id,
        name: k.name,
        nip: k.pegawai.nip,
      };
    }
  }

  // Cari admin prodi per prodi
  const adminProdiMap: Record<string, { id: string; name: string }> = {};
  const adminProdiUsers = await prisma.user.findMany({
    where: { userRoles: { some: { role: { name: 'ADMIN_PRODI' } } } },
    include: { pegawai: { include: { programStudi: true } } },
  });
  for (const ap of adminProdiUsers) {
    if (ap.pegawai?.programStudi) {
      adminProdiMap[ap.pegawai.programStudi.code] = {
        id: ap.id,
        name: ap.name,
      };
    }
  }

  // Admin Fakultas
  const adminFakultas = await prisma.user.findFirst({
    where: { email: 'admin.fakultas@fsm.undip.ac.id' },
  });

  if (!adminFakultas) {
    console.error('❌ Admin Fakultas not found.');
    return;
  }

  // ======================================================================
  // Definisi surat test
  // ======================================================================
  const testLetters = [
    // === DARI MAHASISWA ===
    {
      title: 'Seminar Nasional Matematika 2026',
      pengaju: mahasiswaList.find(m => m.email === 'rina.susanti@students.undip.ac.id') || mahasiswaList[0],
      type: letterTypeST,
      deptCode: 'MATH',
      prodiCode: 'S1-MATH',
    },
    {
      title: 'Workshop Machine Learning Internasional',
      pengaju: mahasiswaList.find(m => m.email === 'ahmad.budi@students.undip.ac.id') || mahasiswaList[1],
      type: letterTypeST,
      deptCode: 'IF',
      prodiCode: 'S1-IF',
    },
    {
      title: 'Konferensi Biologi Tropis Asia Tenggara',
      pengaju: mahasiswaList.find(m => m.email === 'siti.aminah@students.undip.ac.id') || mahasiswaList[2],
      type: letterTypeST,
      deptCode: 'BIO',
      prodiCode: 'S1-BIO',
    },
    {
      title: 'Olimpiade Fisika Nasional 2026',
      pengaju: mahasiswaList.find(m => m.email === 'budi.prasetyo@students.undip.ac.id') || mahasiswaList[3],
      type: letterTypeST,
      deptCode: 'FIS',
      prodiCode: 'S1-FIS',
    },
    {
      title: 'Simposium Kimia Analitik',
      pengaju: mahasiswaList.find(m => m.email === 'fitri.rahmawati@students.undip.ac.id') || mahasiswaList[4],
      type: letterTypeSK,
      deptCode: 'KIM',
      prodiCode: 'S1-KIM',
    },
    {
      title: 'Kompetisi Data Science Nasional',
      pengaju: mahasiswaList.find(m => m.email === 'lisa.anggraini@students.undip.ac.id') || mahasiswaList[5],
      type: letterTypeST,
      deptCode: 'STAT',
      prodiCode: 'S1-STAT',
    },
    {
      title: 'Studi Banding Bioteknologi ke IPB',
      pengaju: mahasiswaList.find(m => m.email === 'rudi.hartono@students.undip.ac.id') || mahasiswaList[6],
      type: letterTypeST,
      deptCode: 'BIO',
      prodiCode: 'S1-BIOTEK',
    },
    {
      title: 'Pelatihan Cybersecurity CTF',
      pengaju: mahasiswaList.find(m => m.email === 'dewi.sartika@students.undip.ac.id') || mahasiswaList[1],
      type: letterTypeST,
      deptCode: 'IF',
      prodiCode: 'S1-IF',
    },
    // === DARI DOSEN ===
    {
      title: 'Penelitian Kolaborasi Statistika-Informatika',
      pengaju: dosenList.find(d => d.email === 'mustafid@lecturer.undip.ac.id') || dosenList[0],
      type: letterTypeST,
      deptCode: 'STAT',
      prodiCode: 'S1-STAT',
      isDosen: true,
    },
    {
      title: 'Pengabdian Masyarakat Desa Binaan',
      pengaju: dosenList.find(d => d.email === 'widowati@lecturer.undip.ac.id') || dosenList[0],
      type: letterTypeST,
      deptCode: 'MATH',
      prodiCode: 'S1-MATH',
      isDosen: true,
    },
    {
      title: 'Seminar Internasional Bioinformatika',
      pengaju: dosenList.find(d => d.email === 'agung.suprihadi@lecturer.undip.ac.id') || dosenList[0],
      type: letterTypeST,
      deptCode: 'BIO',
      prodiCode: 'S1-BIO',
      isDosen: true,
    },
    {
      title: 'Workshop Pemrograman Kuantum',
      pengaju: dosenList.find(d => d.email === 'ainie.khuriati@lecturer.undip.ac.id') || dosenList[0],
      type: letterTypeSK,
      deptCode: 'FIS',
      prodiCode: 'S1-FIS',
      isDosen: true,
    },
    {
      title: 'Konferensi Kimia Organik Asia Pasifik',
      pengaju: dosenList.find(d => d.email === 'khairul.anam@lecturer.undip.ac.id') || dosenList[0],
      type: letterTypeST,
      deptCode: 'KIM',
      prodiCode: 'S1-KIM',
      isDosen: true,
    },
    {
      title: 'Visiting Lecturer di University of Tokyo',
      pengaju: dosenList.find(d => d.email === 'raden.satrio@lecturer.undip.ac.id') || dosenList[0],
      type: letterTypeST,
      deptCode: 'IF',
      prodiCode: 'S1-IF',
      isDosen: true,
    },
    {
      title: 'Pelatihan Fermentasi Skala Industri',
      pengaju: dosenList.find(d => d.email === 'endang.kusdiyantini@lecturer.undip.ac.id') || dosenList[0],
      type: letterTypeST,
      deptCode: 'BIO',
      prodiCode: 'S1-BIOTEK',
      isDosen: true,
    },
  ];

  let count = 0;

  for (const letter of testLetters) {
    if (!letter.pengaju) {
      console.log(`   ⚠️ Skipping "${letter.title}" - pengaju not found`);
      continue;
    }

    const kadep = kadepMap[letter.deptCode];
    const adminProdi = adminProdiMap[letter.prodiCode];

    if (!kadep || !adminProdi) {
      console.log(`   ⚠️ Skipping "${letter.title}" - kadep/admin prodi not found for ${letter.deptCode}/${letter.prodiCode}`);
      continue;
    }

    const pengaju = letter.pengaju;
    const mhsData = (pengaju as any).mahasiswa;
    const dosenData = (pengaju as any).pegawai;

    const nama = pengaju.name;
    const nim = mhsData?.nim || '';
    const nip = dosenData?.nip || '';
    const prodi = mhsData?.programStudi?.name || dosenData?.programStudi?.name || 'Unknown';
    const dept = mhsData?.departemen?.name || dosenData?.departemen?.name || 'Unknown';

    const submissionValues = {
      nama,
      nim: nim || undefined,
      nip: nip || undefined,
      departemen: dept,
      programStudi: prodi,
      jenisSurat: letter.type.code === 'ST' ? 'SURAT_TUGAS' : 'SURAT_KEPUTUSAN',
      keperluan: `Mengikuti ${letter.title}`,
      judulAcara: letter.title,
      tanggalAcara: '2026-04-15',
      durasiAcara: '3 hari',
      lokasiAcara: 'Jakarta Convention Center',
      butuhTtdKadep: true,
    };

    // Create the letter instance at SURAT_PENGANTAR_SIGNED status
    // (ready for Admin Fakultas to forward)
    const instance = await prisma.letterInstance.create({
      data: {
        submissionValues,
        status: LetterStatus.SURAT_PENGANTAR_SIGNED,
        currentActiveRole: 'ADMIN_FAKULTAS',
        currentActiveUserId: null,
        priority: Priority.NORMAL,
        signatureConfig: {
          targetSigner: 'DEKAN',
          requestKadepSign: true,
        },
        letterTypeId: letter.type.id,
        createdById: pengaju.id,
      },
    });

    // Create surat pengantar document (already signed)
    const doc = await prisma.letterDocument.create({
      data: {
        letterInstanceId: instance.id,
        type: DocumentType.SURAT_PENGANTAR,
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'SURAT PENGANTAR' }],
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `Dengan ini kami sampaikan bahwa ${nama} bermaksud untuk mengikuti kegiatan "${letter.title}".`,
                },
              ],
            },
          ],
        },
        perihal: letter.title,
        isSigned: true,
      },
    });

    // Create kadep signature on the document (signed)
    await prisma.documentSignature.create({
      data: {
        documentId: doc.id,
        signerId: kadep.id,
        signerRole: 'KADEP',
        signerName: kadep.name,
        signerNip: kadep.nip,
        status: SignatureStatus.SIGNED,
        signedAt: new Date(),
        order: 1,
      },
    });

    // Create realistic logs
    const now = new Date();
    const logs = [
      {
        letterInstanceId: instance.id,
        actorId: pengaju.id,
        actorRole: letter.isDosen ? 'DOSEN' : 'MAHASISWA',
        action: LogAction.SUBMIT,
        fromStatus: null,
        toStatus: LetterStatus.SUBMITTED,
        notes: `Pengajuan surat: ${letter.title}`,
        createdAt: new Date(now.getTime() - 4 * 86400000), // 4 days ago
      },
      {
        letterInstanceId: instance.id,
        actorId: adminProdi.id,
        actorRole: 'ADMIN_PRODI',
        action: LogAction.DRAFT_CREATE,
        fromStatus: LetterStatus.SUBMITTED,
        toStatus: LetterStatus.SURAT_PENGANTAR_DRAFT,
        notes: 'Draft surat pengantar dibuat',
        createdAt: new Date(now.getTime() - 3 * 86400000), // 3 days ago
      },
      {
        letterInstanceId: instance.id,
        actorId: adminProdi.id,
        actorRole: 'ADMIN_PRODI',
        action: LogAction.SUBMIT,
        fromStatus: LetterStatus.SURAT_PENGANTAR_DRAFT,
        toStatus: LetterStatus.SURAT_PENGANTAR_REVIEW,
        notes: 'Draft surat pengantar diajukan untuk ditandatangani',
        createdAt: new Date(now.getTime() - 3 * 86400000 + 3600000),
      },
      {
        letterInstanceId: instance.id,
        actorId: kadep.id,
        actorRole: 'KADEP',
        action: LogAction.SIGN,
        fromStatus: LetterStatus.SURAT_PENGANTAR_REVIEW,
        toStatus: LetterStatus.SURAT_PENGANTAR_SIGNED,
        notes: 'Surat pengantar ditandatangani',
        createdAt: new Date(now.getTime() - 2 * 86400000), // 2 days ago
      },
    ];

    await prisma.letterLog.createMany({ data: logs });

    count++;
    console.log(`   ✅ #${count} "${letter.title}" — oleh ${nama} (${letter.isDosen ? 'Dosen' : 'Mahasiswa'} ${prodi})`);
  }

  console.log(`\n🎉 Berhasil insert ${count} surat test!`);
  console.log('📋 Semua surat berstatus SURAT_PENGANTAR_SIGNED');
  console.log('📋 Siap untuk Admin Fakultas meneruskan (forward) ke pejabat/staf');
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
