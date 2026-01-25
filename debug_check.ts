import { PrismaClient } from './src/generated/prisma/client';

const db = new PrismaClient();

async function main() {
  // Check mahasiswa
  const mhs = await db.mahasiswa.findFirst({
    where: { user: { email: 'ahmad.budi@students.undip.ac.id' } },
    include: { programStudi: true, user: { select: { id: true, name: true, email: true } } }
  });
  console.log('=== MAHASISWA ===');
  console.log(JSON.stringify(mhs, null, 2));

  // Check the letter instance
  const letter = await db.letterInstance.findFirst({
    where: { id: 'cmkt9go820005o9ng25l68elz' },
    include: { createdBy: { include: { mahasiswa: true } } }
  });
  console.log('\n=== LETTER INSTANCE ===');
  console.log('Status:', letter?.status);
  console.log('currentActiveRole:', letter?.currentActiveRole);
  console.log('createdBy:', letter?.createdBy?.name);
  console.log('createdBy.mahasiswa:', letter?.createdBy?.mahasiswa);

  // Check kaprodi
  const kaprodi = await db.pegawai.findFirst({
    where: { user: { email: 'kaprodi.if@undip.ac.id' } },
    include: { programStudi: true }
  });
  console.log('\n=== KAPRODI ===');
  console.log('programStudiId:', kaprodi?.programStudiId);
  console.log('programStudi:', kaprodi?.programStudi?.name);

  // Check if prodi matches
  if (mhs && kaprodi) {
    console.log('\n=== PRODI MATCH CHECK ===');
    console.log('Mahasiswa prodiId:', mhs.programStudiId);
    console.log('Kaprodi prodiId:', kaprodi.programStudiId);
    console.log('Match:', mhs.programStudiId === kaprodi.programStudiId);
  }

  await db.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
