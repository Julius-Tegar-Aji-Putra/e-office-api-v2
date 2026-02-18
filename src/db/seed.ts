import { PrismaClient } from '../generated/prisma/client';
import { 
  LetterCategory, 
  LetterStatus, 
  DocumentType,
  LogAction,
  Priority,
  Jenjang
} from '../generated/prisma/enums';
import { randomUUID } from 'crypto';
import { hashPassword } from 'better-auth/crypto';

const prisma = new PrismaClient();

// ============================================================================
// HELPER & CONSTANTS
// ============================================================================
const DEFAULT_PASSWORD = "password1234";

// Role constants sesuai Prompting.md
const ROLES = {
  SUPERADMIN: 'SUPERADMIN',
  MAHASISWA: 'MAHASISWA',
  DOSEN: 'DOSEN',
  KAPRODI: 'KAPRODI',
  ADMIN_PRODI: 'ADMIN_PRODI',
  KADEP: 'KADEP',
  ADMIN_FAKULTAS: 'ADMIN_FAKULTAS',
  DEKAN: 'DEKAN',
  WADEK_1: 'WADEK_1',
  WADEK_2: 'WADEK_2',
  MANAJER_TU: 'MANAJER_TU',
  SUPERVISOR_AKADEMIK: 'SUPERVISOR_AKADEMIK',
  SUPERVISOR_SUMBER_DAYA: 'SUPERVISOR_SUMBER_DAYA',
  STAF_AKADEMIK: 'STAF_AKADEMIK',
  STAF_SUMBER_DAYA: 'STAF_SUMBER_DAYA',
  UPA: 'UPA'
} as const;

async function main() {
  console.log('🚀 Starting E-Office V2 Seeding...');
  console.log('━'.repeat(60));

  // ====================================================================
  // 1. CLEANUP DATABASE
  // ====================================================================
  console.log('🧹 Cleaning up database...');
  
  const deleteTables = [
    prisma.letterLog.deleteMany(),
    prisma.documentSignature.deleteMany(),
    prisma.letterDocument.deleteMany(),
    prisma.letterAttachment.deleteMany(),
    prisma.letterInstance.deleteMany(),
    prisma.letterTemplate.deleteMany(),
    prisma.letterType.deleteMany(),
    prisma.savedSignature.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.mahasiswa.deleteMany(),
    prisma.pegawai.deleteMany(),
    prisma.user.deleteMany(),
    prisma.programStudi.deleteMany(),
    prisma.departemen.deleteMany(),
    prisma.role.deleteMany(),
  ];

  await prisma.$transaction(deleteTables);
  console.log('✨ Database cleaned!\n');

  // ====================================================================
  // 2. CREATE ROLES 
  // ====================================================================
  console.log('📋 Creating Roles...');
  
  const roleList = Object.values(ROLES);
  const roleMap = new Map<string, string>();

  for (const roleName of roleList) {
    const role = await prisma.role.create({ 
      data: { 
        name: roleName,
        description: getRoleDescription(roleName)
      } 
    });
    roleMap.set(roleName, role.id);
    console.log(`   ✓ ${roleName}`);
  }

  // ====================================================================
  // 3. CREATE PERMISSIONS
  // ====================================================================
  console.log('\n🔐 Creating Permissions...');
  
  const permissions = [
    // Letter permissions
    { resource: 'letter', action: 'create' },
    { resource: 'letter', action: 'read' },
    { resource: 'letter', action: 'update' },
    { resource: 'letter', action: 'delete' },
    { resource: 'letter', action: 'approve' },
    { resource: 'letter', action: 'reject' },
    { resource: 'letter', action: 'sign' },
    { resource: 'letter', action: 'disposition' },
    { resource: 'letter', action: 'verify' },
    // Dashboard permissions
    { resource: 'dashboard', action: 'view_all' },
    { resource: 'dashboard', action: 'view_own' },
    { resource: 'dashboard', action: 'view_department' },
    { resource: 'dashboard', action: 'view_faculty' },
    // Master data
    { resource: 'master', action: 'manage' },
  ];

  for (const p of permissions) {
    await prisma.permission.create({ data: p });
  }
  console.log(`   ✓ Created ${permissions.length} permissions`);

  // ====================================================================
  // 4. CREATE ACADEMIC STRUCTURE (Departemen & Prodi)
  // ====================================================================
  console.log('\n🏫 Creating Academic Structure...');
  
  // -- Departemen FSM --
  const deptMap = new Map<string, string>();
  const departments = [
    { name: 'Departemen Matematika', code: 'MATH' },
    { name: 'Departemen Biologi', code: 'BIO' },
    { name: 'Departemen Kimia', code: 'KIM' },
    { name: 'Departemen Fisika', code: 'FIS' },
    { name: 'Departemen Statistika', code: 'STAT' },
    { name: 'Departemen Informatika', code: 'IF' },
    { name: 'Fakultas Sains dan Matematika', code: 'FSM' } // For faculty-level staff
  ];

  for (const d of departments) {
    const dept = await prisma.departemen.create({ data: d });
    deptMap.set(d.code, dept.id);
    console.log(`   ✓ Dept: ${d.name}`);
  }

  // -- Program Studi --
  const prodiMap = new Map<string, string>();
  const programStudi = [
    { name: 'S1 Matematika', code: 'S1-MATH', dept: 'MATH', jenjang: Jenjang.S1, hasKaprodi: false },
    { name: 'S2 Matematika', code: 'S2-MATH', dept: 'MATH', jenjang: Jenjang.S2, hasKaprodi: true },
    { name: 'S1 Biologi', code: 'S1-BIO', dept: 'BIO', jenjang: Jenjang.S1, hasKaprodi: false },
    { name: 'S1 Bioteknologi', code: 'S1-BIOTEK', dept: 'BIO', jenjang: Jenjang.S1, hasKaprodi: true },
    { name: 'S2 Biologi', code: 'S2-BIO', dept: 'BIO', jenjang: Jenjang.S2, hasKaprodi: true },
    { name: 'S1 Fisika', code: 'S1-FIS', dept: 'FIS', jenjang: Jenjang.S1, hasKaprodi: false },
    { name: 'S2 Fisika', code: 'S2-FIS', dept: 'FIS', jenjang: Jenjang.S2, hasKaprodi: true },
    { name: 'Profesi Fisikawan Medik', code: 'PROF-FM', dept: 'FIS', jenjang: Jenjang.PROFESI, hasKaprodi: true },
    { name: 'S1 Kimia', code: 'S1-KIM', dept: 'KIM', jenjang: Jenjang.S1, hasKaprodi: false },
    { name: 'S2 Kimia', code: 'S2-KIM', dept: 'KIM', jenjang: Jenjang.S2, hasKaprodi: true },
    { name: 'S1 Statistika', code: 'S1-STAT', dept: 'STAT', jenjang: Jenjang.S1, hasKaprodi: false },
    { name: 'S1 Informatika', code: 'S1-IF', dept: 'IF', jenjang: Jenjang.S1, hasKaprodi: false },
    { name: 'Fakultas', code: 'FAKULTAS', dept: 'FSM', jenjang: Jenjang.S1, hasKaprodi: false } // Placeholder for faculty staff
  ];

  for (const p of programStudi) {
    const prodi = await prisma.programStudi.create({
      data: {
        name: p.name,
        code: p.code,
        jenjang: p.jenjang,
        hasKaprodi: p.hasKaprodi,
        managedByRole: p.hasKaprodi ? 'KAPRODI' : 'KADEP',
        departemenId: deptMap.get(p.dept)!
      }
    });
    prodiMap.set(p.code, prodi.id);
  }
  console.log(`   ✓ Created ${programStudi.length} program studi`);

  // ====================================================================
  // 5. CREATE USERS (Lengkap sesuai skenario)
  // ====================================================================
  console.log('\n👥 Creating Users...');
  
  interface CreateUserParams {
    name: string;
    email: string;
    roleName: string;
    profile?: {
      nim?: string;
      nip?: string;
      jabatan?: string;
      noHp?: string;
      tahunMasuk?: string;
      deptCode: string;
      prodiCode: string;
    };
  }

  // Hash password sekali saja untuk semua user (using Better Auth's hashPassword)
  const hashedPassword = await hashPassword(DEFAULT_PASSWORD);

  const createUser = async ({ name, email, roleName, profile }: CreateUserParams) => {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            providerId: 'credential',
            accountId: email,
            password: hashedPassword // Gunakan hashed password
          }
        },
        userRoles: {
          create: { roleId: roleMap.get(roleName)! }
        }
      }
    });

    // Create profile based on role
    if (roleName === ROLES.MAHASISWA && profile) {
      await prisma.mahasiswa.create({
        data: {
          userId: user.id,
          nim: profile.nim || `NIM${Date.now()}`,
          tahunMasuk: profile.tahunMasuk || '2024',
          noHp: profile.noHp || '08123456789',
          departemenId: deptMap.get(profile.deptCode)!,
          programStudiId: prodiMap.get(profile.prodiCode)!
        }
      });
    } else if (roleName !== ROLES.SUPERADMIN && profile) {
      // Check if pegawai with this NIP already exists (for users with multiple roles)
      const existingPegawai = await prisma.pegawai.findUnique({
        where: { nip: profile.nip || `NIP${Date.now()}` }
      });

      if (!existingPegawai) {
        await prisma.pegawai.create({
          data: {
            userId: user.id,
            nip: profile.nip || `NIP${Date.now()}`,
            jabatan: profile.jabatan || roleName,
            noHp: profile.noHp,
            departemenId: deptMap.get(profile.deptCode)!,
            programStudiId: prodiMap.get(profile.prodiCode)!
          }
        });
      }
    }

    console.log(`   ✓ ${roleName}: ${name} <${email}>`);
    return user;
  };

  // --- SUPERADMIN ---
  await createUser({
    name: 'Super Admin',
    email: 'superadmin@fsm.undip.ac.id',
    roleName: ROLES.SUPERADMIN
  });

  // --- MAHASISWA ---
  // Informatika
  const mhsIf1 = await createUser({
    name: 'Ahmad Budi Santoso',
    email: 'ahmad.budi@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24060121130001',
      tahunMasuk: '2024',
      noHp: '081234567001',
      deptCode: 'IF',
      prodiCode: 'S1-IF'
    }
  });

  const mhsIf2 = await createUser({
    name: 'Dewi Sartika',
    email: 'dewi.sartika@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24060121130002',
      tahunMasuk: '2024',
      noHp: '081234567002',
      deptCode: 'IF',
      prodiCode: 'S1-IF'
    }
  });

  // Biologi - S1 Biologi (ke KADEP)
  const mhsBioS1 = await createUser({
    name: 'Siti Aminah',
    email: 'siti.aminah@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24020121130001',
      tahunMasuk: '2024',
      noHp: '081234567003',
      deptCode: 'BIO',
      prodiCode: 'S1-BIO'
    }
  });

  // Biologi - S1 Bioteknologi (ke KAPRODI karena hasKaprodi=true)
  const mhsBiotek = await createUser({
    name: 'Rudi Hartono',
    email: 'rudi.hartono@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24021121130001',
      tahunMasuk: '2024',
      noHp: '081234567004',
      deptCode: 'BIO',
      prodiCode: 'S1-BIOTEK'
    }
  });

  // Biologi - S2 Biologi (ke KAPRODI)
  const mhsBioS2 = await createUser({
    name: 'Dewi Lestari',
    email: 'dewi.lestari@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24020221130001',
      tahunMasuk: '2024',
      noHp: '081234567005',
      deptCode: 'BIO',
      prodiCode: 'S2-BIO'
    }
  });

  // Fisika - S1 Fisika (ke KADEP)
  const mhsFisS1 = await createUser({
    name: 'Budi Prasetyo',
    email: 'budi.prasetyo@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24030121130001',
      tahunMasuk: '2024',
      noHp: '081234567006',
      deptCode: 'FIS',
      prodiCode: 'S1-FIS'
    }
  });

  // Fisika - S2 Fisika (ke KAPRODI)
  const mhsFisS2 = await createUser({
    name: 'Andi Wijaya',
    email: 'andi.wijaya@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24030221130001',
      tahunMasuk: '2024',
      noHp: '081234567007',
      deptCode: 'FIS',
      prodiCode: 'S2-FIS'
    }
  });

  // Kimia - S1 Kimia (ke KADEP)
  const mhsKimS1 = await createUser({
    name: 'Fitri Rahmawati',
    email: 'fitri.rahmawati@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24040121130001',
      tahunMasuk: '2024',
      noHp: '081234567008',
      deptCode: 'KIM',
      prodiCode: 'S1-KIM'
    }
  });

  // Kimia - S2 Kimia (ke KAPRODI)
  const mhsKimS2 = await createUser({
    name: 'Hendra Gunawan',
    email: 'hendra.gunawan@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24040221130001',
      tahunMasuk: '2024',
      noHp: '081234567009',
      deptCode: 'KIM',
      prodiCode: 'S2-KIM'
    }
  });

  // Matematika - S1 Matematika (ke KADEP)
  const mhsMathS1 = await createUser({
    name: 'Rina Susanti',
    email: 'rina.susanti@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24010121130001',
      tahunMasuk: '2024',
      noHp: '081234567020',
      deptCode: 'MATH',
      prodiCode: 'S1-MATH'
    }
  });

  // Matematika - S2 Matematika (ke KAPRODI)
  const mhsMathS2 = await createUser({
    name: 'Joko Santoso',
    email: 'joko.santoso@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24010221130001',
      tahunMasuk: '2024',
      noHp: '081234567021',
      deptCode: 'MATH',
      prodiCode: 'S2-MATH'
    }
  });

  // Statistika - S1 Statistika (ke KADEP)
  const mhsStatS1 = await createUser({
    name: 'Lisa Anggraini',
    email: 'lisa.anggraini@students.undip.ac.id',
    roleName: ROLES.MAHASISWA,
    profile: {
      nim: '24050121130001',
      tahunMasuk: '2024',
      noHp: '081234567022',
      deptCode: 'STAT',
      prodiCode: 'S1-STAT'
    }
  });

  console.log('   ✓ Created 12 MAHASISWA accounts from various departments');

  // --- DOSEN (Informatika) ---
  const dosenIf = await createUser({
    name: 'Dr. Raden Satrio, M.Kom.',
    email: 'raden.satrio@lecturer.undip.ac.id',
    roleName: ROLES.DOSEN,
    profile: {
      nip: '198501152010121001',
      jabatan: 'Dosen',
      noHp: '081234567010',
      deptCode: 'IF',
      prodiCode: 'S1-IF'
    }
  });

  // --- KETUA PRODI (KAPRODI) - 7 accounts for prodi with hasKaprodi=true ---
  const kaprodiS2Math = await createUser({
    name: 'Dr. Lucia Ratnasari, S.Si., M.Si.',
    email: 'kaprodi.s2.matematika@fsm.undip.ac.id',
    roleName: ROLES.KAPRODI,
    profile: {
      nip: '197012061996032001',
      jabatan: 'Ketua Program Studi Magister Matematika',
      noHp: '081234567100',
      deptCode: 'MATH',
      prodiCode: 'S2-MATH'
    }
  });

  const kaprodiS1Biotek = await createUser({
    name: 'Dr. Sri Pujiyanto, S.Si., M.Si.',
    email: 'kaprodi.s1.bioteknologi@fsm.undip.ac.id',
    roleName: ROLES.KAPRODI,
    profile: {
      nip: '197305141999031003',
      jabatan: 'Ketua Program Studi S1 Bioteknologi',
      noHp: '081234567101',
      deptCode: 'BIO',
      prodiCode: 'S1-BIOTEK'
    }
  });

  const kaprodiS2Bio = await createUser({
    name: 'Prof. Dr. Dra. Erma Prihastanti, M.Si.',
    email: 'kaprodi.s2.biologi@fsm.undip.ac.id',
    roleName: ROLES.KAPRODI,
    profile: {
      nip: '196204211987032001',
      jabatan: 'Ketua Program Studi Magister Biologi',
      noHp: '081234567102',
      deptCode: 'BIO',
      prodiCode: 'S2-BIO'
    }
  });

  const kaprodiS2Fis = await createUser({
    name: 'Dr. Eng. Eko Hidayanto, S.Si., M.Si.',
    email: 'kaprodi.s2.fisika@fsm.undip.ac.id',
    roleName: ROLES.KAPRODI,
    profile: {
      nip: '197301031998021001',
      jabatan: 'Ketua Program Studi Magister Fisika',
      noHp: '081234567103',
      deptCode: 'FIS',
      prodiCode: 'S2-FIS'
    }
  });

  const kaprodiProfFM = await createUser({
    name: 'Dr. Choirul Anam, S.Si., M.Si., F.Med.',
    email: 'kaprodi.profesi.fisikawanmedik@fsm.undip.ac.id',
    roleName: ROLES.KAPRODI,
    profile: {
      nip: '198004272005011002',
      jabatan: 'Ketua Prodi Pendidikan Profesi Fisikawan Medik',
      noHp: '081234567104',
      deptCode: 'FIS',
      prodiCode: 'PROF-FM'
    }
  });

  const kaprodiS2Kim = await createUser({
    name: 'Drs. Gunawan, M.Si., Ph.D.',
    email: 'kaprodi.s2.kimia@fsm.undip.ac.id',
    roleName: ROLES.KAPRODI,
    profile: {
      nip: '196307181991031002',
      jabatan: 'Ketua Program Studi Magister Kimia',
      noHp: '081234567105',
      deptCode: 'KIM',
      prodiCode: 'S2-KIM'
    }
  });

  console.log('   ✓ Created 7 KAPRODI accounts');

  // --- ADMIN PRODI - 12 accounts (1 per prodi) ---
  const adminProdiS1Math = await createUser({
    name: 'Admin Prodi S1 Matematika',
    email: 'admin.s1.matematika@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010001',
      jabatan: 'Admin Program Studi S1 Matematika',
      noHp: '081234567200',
      deptCode: 'MATH',
      prodiCode: 'S1-MATH'
    }
  });

  const adminProdiS2Math = await createUser({
    name: 'Admin Prodi S2 Matematika',
    email: 'admin.s2.matematika@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010002',
      jabatan: 'Admin Program Studi S2 Matematika',
      noHp: '081234567201',
      deptCode: 'MATH',
      prodiCode: 'S2-MATH'
    }
  });

  const adminProdiS1Bio = await createUser({
    name: 'Admin Prodi S1 Biologi',
    email: 'admin.s1.biologi@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010003',
      jabatan: 'Admin Program Studi S1 Biologi',
      noHp: '081234567202',
      deptCode: 'BIO',
      prodiCode: 'S1-BIO'
    }
  });

  const adminProdiS1Biotek = await createUser({
    name: 'Admin Prodi S1 Bioteknologi',
    email: 'admin.s1.bioteknologi@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010004',
      jabatan: 'Admin Program Studi S1 Bioteknologi',
      noHp: '081234567203',
      deptCode: 'BIO',
      prodiCode: 'S1-BIOTEK'
    }
  });

  const adminProdiS2Bio = await createUser({
    name: 'Admin Prodi S2 Biologi',
    email: 'admin.s2.biologi@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010005',
      jabatan: 'Admin Program Studi S2 Biologi',
      noHp: '081234567204',
      deptCode: 'BIO',
      prodiCode: 'S2-BIO'
    }
  });

  const adminProdiS1Fis = await createUser({
    name: 'Admin Prodi S1 Fisika',
    email: 'admin.s1.fisika@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010006',
      jabatan: 'Admin Program Studi S1 Fisika',
      noHp: '081234567205',
      deptCode: 'FIS',
      prodiCode: 'S1-FIS'
    }
  });

  const adminProdiS2Fis = await createUser({
    name: 'Admin Prodi S2 Fisika',
    email: 'admin.s2.fisika@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010007',
      jabatan: 'Admin Program Studi S2 Fisika',
      noHp: '081234567206',
      deptCode: 'FIS',
      prodiCode: 'S2-FIS'
    }
  });

  const adminProdiProfFM = await createUser({
    name: 'Admin Prodi Profesi Fisikawan Medik',
    email: 'admin.profesi.fisikawanmedik@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010008',
      jabatan: 'Admin Prodi Pendidikan Profesi Fisikawan Medik',
      noHp: '081234567207',
      deptCode: 'FIS',
      prodiCode: 'PROF-FM'
    }
  });

  const adminProdiS1Kim = await createUser({
    name: 'Admin Prodi S1 Kimia',
    email: 'admin.s1.kimia@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010009',
      jabatan: 'Admin Program Studi S1 Kimia',
      noHp: '081234567208',
      deptCode: 'KIM',
      prodiCode: 'S1-KIM'
    }
  });

  const adminProdiS2Kim = await createUser({
    name: 'Admin Prodi S2 Kimia',
    email: 'admin.s2.kimia@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010010',
      jabatan: 'Admin Program Studi S2 Kimia',
      noHp: '081234567209',
      deptCode: 'KIM',
      prodiCode: 'S2-KIM'
    }
  });

  const adminProdiS1Stat = await createUser({
    name: 'Admin Prodi S1 Statistika',
    email: 'admin.s1.statistika@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010011',
      jabatan: 'Admin Program Studi S1 Statistika',
      noHp: '081234567210',
      deptCode: 'STAT',
      prodiCode: 'S1-STAT'
    }
  });

  const adminProdiS1If = await createUser({
    name: 'Admin Prodi S1 Informatika',
    email: 'admin.s1.informatika@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_PRODI,
    profile: {
      nip: '199001010012',
      jabatan: 'Admin Program Studi S1 Informatika',
      noHp: '081234567211',
      deptCode: 'IF',
      prodiCode: 'S1-IF'
    }
  });

  console.log('   ✓ Created 12 ADMIN_PRODI accounts');

  // --- KETUA DEPARTEMEN (KADEP) - 6 accounts (1 per department) ---
  const kadepMath = await createUser({
    name: 'Dr. Susilo Hariyanto, S.Si., M.Si.',
    email: 'kadep.matematika@fsm.undip.ac.id',
    roleName: ROLES.KADEP,
    profile: {
      nip: '197410142000121001',
      jabatan: 'Ketua Departemen Matematika',
      noHp: '081234567300',
      deptCode: 'MATH',
      prodiCode: 'S1-MATH'
    }
  });

  const kadepBio = await createUser({
    name: 'Prof. Drs. Sapto Purnomo Putro, M.Si., Ph.D.',
    email: 'kadep.biologi@fsm.undip.ac.id',
    roleName: ROLES.KADEP,
    profile: {
      nip: '196612261994031008',
      jabatan: 'Ketua Departemen Biologi',
      noHp: '081234567301',
      deptCode: 'BIO',
      prodiCode: 'S1-BIO'
    }
  });

  const kadepFis = await createUser({
    name: 'Prof. Dr. Heri Sutanto, S.Si., M.Si.',
    email: 'kadep.fisika@fsm.undip.ac.id',
    roleName: ROLES.KADEP,
    profile: {
      nip: '197502151998021001',
      jabatan: 'Ketua Departemen Fisika',
      noHp: '081234567302',
      deptCode: 'FIS',
      prodiCode: 'S1-FIS'
    }
  });

  const kadepKim = await createUser({
    name: 'Adi Darmawan, S.Si., M.Si., Ph.D.',
    email: 'kadep.kimia@fsm.undip.ac.id',
    roleName: ROLES.KADEP,
    profile: {
      nip: '197311211997021001',
      jabatan: 'Ketua Departemen Kimia',
      noHp: '081234567303',
      deptCode: 'KIM',
      prodiCode: 'S1-KIM'
    }
  });

  const kadepStat = await createUser({
    name: 'Dr. Drs. Tarno, M.Si.',
    email: 'kadep.statistika@fsm.undip.ac.id',
    roleName: ROLES.KADEP,
    profile: {
      nip: '196307061991021001',
      jabatan: 'Ketua Departemen Statistika',
      noHp: '081234567304',
      deptCode: 'STAT',
      prodiCode: 'S1-STAT'
    }
  });

  const kadepIf = await createUser({
    name: 'Dr. Aris Sugiharto, S.Si., M.Kom.',
    email: 'kadep.informatika@fsm.undip.ac.id',
    roleName: ROLES.KADEP,
    profile: {
      nip: '197108111997021004',
      jabatan: 'Ketua Departemen Informatika',
      noHp: '081234567305',
      deptCode: 'IF',
      prodiCode: 'S1-IF'
    }
  });

  console.log('   ✓ Created 6 KADEP accounts');

  // --- PEJABAT FAKULTAS ---
  const adminFakultas = await createUser({
    name: 'Bambang Wicaksono, S.E.',
    email: 'admin.fakultas@fsm.undip.ac.id',
    roleName: ROLES.ADMIN_FAKULTAS,
    profile: {
      nip: '198807152015041001',
      jabatan: 'Admin Surat Fakultas',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  const dekan = await createUser({
    name: 'Prof. Dr. Kusworo Adi, S.Si., M.T.',
    email: 'dekan@fsm.undip.ac.id',
    roleName: ROLES.DEKAN,
    profile: {
      nip: '197203171998021001',
      jabatan: 'Dekan FSM',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  const wadek1 = await createUser({
    name: 'Dr. Ngadiwiyana, S.Si., M.Si.',
    email: 'wadek1@fsm.undip.ac.id',
    roleName: ROLES.WADEK_1,
    profile: {
      nip: '196906201999031002',
      jabatan: 'Wakil Dekan I (Bidang Akademik & Kemahasiswaan)',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  const wadek2 = await createUser({
    name: 'Dr. Eng. Adi Wibowo, S.Si., M.Kom.',
    email: 'wadek2@fsm.undip.ac.id',
    roleName: ROLES.WADEK_2,
    profile: {
      nip: '198203092006041002',
      jabatan: 'Wakil Dekan II (Bidang Sumber Daya)',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  const manajerTu = await createUser({
    name: 'Lilik Maryuni, S.E., M.Si.',
    email: 'manajer.tu@fsm.undip.ac.id',
    roleName: ROLES.MANAJER_TU,
    profile: {
      nip: '197009031991032002',
      jabatan: 'Manajer Tata Usaha',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  const spvAkademik = await createUser({
    name: 'Umi Arbiati, S.Kom.',
    email: 'spv.akademik@fsm.undip.ac.id',
    roleName: ROLES.SUPERVISOR_AKADEMIK,
    profile: {
      nip: '197805122005012002',
      jabatan: 'Supervisor Subbagian Akademik dan Kemahasiswaan',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  const spvSumberDaya = await createUser({
    name: 'Awang Kurnia Saputra, S.Kom.',
    email: 'spv.sumberdaya@fsm.undip.ac.id',
    roleName: ROLES.SUPERVISOR_SUMBER_DAYA,
    profile: {
      nip: '197906142009101002',
      jabatan: 'Supervisor Subbagian Sumber Daya',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  const stafAkademik1 = await createUser({
    name: 'Rina Oktavia, A.Md.',
    email: 'staf.akademik1@fsm.undip.ac.id',
    roleName: ROLES.STAF_AKADEMIK,
    profile: {
      nip: '199205152018032001',
      jabatan: 'Staf Akademik',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  const stafAkademik2 = await createUser({
    name: 'Budi Hartono, A.Md.',
    email: 'staf.akademik2@fsm.undip.ac.id',
    roleName: ROLES.STAF_AKADEMIK,
    profile: {
      nip: '199305152018031001',
      jabatan: 'Staf Akademik',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  const stafSumberDaya = await createUser({
    name: 'Yuni Astuti, A.Md.',
    email: 'staf.sumberdaya@fsm.undip.ac.id',
    roleName: ROLES.STAF_SUMBER_DAYA,
    profile: {
      nip: '199105152017032001',
      jabatan: 'Staf Sumber Daya',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  const upaUser = await createUser({
    name: 'Hendra Wijaya, S.Kom.',
    email: 'upa@fsm.undip.ac.id',
    roleName: ROLES.UPA,
    profile: {
      nip: '199008152016031001',
      jabatan: 'Staff Unit Pelaksana Akademik',
      deptCode: 'FSM',
      prodiCode: 'FAKULTAS'
    }
  });

  // ====================================================================
  // 6. CREATE LETTER TYPES & TEMPLATES
  // ====================================================================
  console.log('\n📄 Creating Letter Types & Templates...');
  
  // Type 1: Surat Tugas
  const typeST = await prisma.letterType.create({
    data: {
      name: 'Surat Tugas',
      code: 'ST',
      description: 'Surat Tugas untuk kegiatan/perjalanan dinas',
      category: LetterCategory.UMUM,
      requiresPengantar: true,
      requiresDekanSign: true,
      requiresWadekSign: false,
      defaultTargetSigner: 'DEKAN'
    }
  });

  // Type 2: Surat Keputusan
  const typeSK = await prisma.letterType.create({
    data: {
      name: 'Surat Keputusan',
      code: 'SK',
      description: 'Surat Keputusan Dekan',
      category: LetterCategory.UMUM,
      requiresPengantar: true,
      requiresDekanSign: true,
      requiresWadekSign: false,
      defaultTargetSigner: 'DEKAN'
    }
  });

  // Type 3: SK Akademik (Pembimbing/Penguji)
  const typeSkAkademik = await prisma.letterType.create({
    data: {
      name: 'SK Pembimbing/Penguji',
      code: 'SK-AKADEMIK',
      description: 'SK Penetapan Pembimbing atau Penguji Tugas Akhir',
      category: LetterCategory.AKADEMIK,
      requiresPengantar: true,
      requiresDekanSign: true,
      requiresWadekSign: true,
      defaultTargetSigner: 'DEKAN'
    }
  });

  // Template untuk Surat Tugas
  await prisma.letterTemplate.create({
    data: {
      versionName: 'v1.0',
      letterTypeId: typeST.id,
      schemaDefinition: {
        type: "object",
        required: ["keperluan", "nama_kegiatan", "tanggal_mulai", "lokasi"],
        properties: {
          keperluan: { type: "string", title: "Keperluan" },
          nama_kegiatan: { type: "string", title: "Nama Kegiatan/Acara" },
          tanggal_mulai: { type: "string", format: "date", title: "Tanggal Mulai" },
          tanggal_selesai: { type: "string", format: "date", title: "Tanggal Selesai" },
          durasi: { type: "string", title: "Durasi Kegiatan" },
          lokasi: { type: "string", title: "Lokasi Kegiatan" },
          keterangan: { type: "string", title: "Keterangan Tambahan" }
        }
      },
      formFields: [
        { key: "keperluan", label: "Keperluan", type: "text", required: true },
        { key: "nama_kegiatan", label: "Nama Kegiatan/Acara", type: "text", required: true },
        { key: "tanggal_mulai", label: "Tanggal Mulai", type: "date", required: true },
        { key: "tanggal_selesai", label: "Tanggal Selesai", type: "date", required: false },
        { key: "durasi", label: "Durasi", type: "text", required: false },
        { key: "lokasi", label: "Lokasi", type: "text", required: true },
        { key: "keterangan", label: "Keterangan", type: "textarea", required: false }
      ],
      contentTemplate: {
        // TipTap JSON content template - simplified for seed
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "SURAT TUGAS" }]
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Nomor: {{nomor_surat}}" }]
          }
        ]
      },
      isActive: true
    }
  });

  // Template untuk Surat Keputusan
  await prisma.letterTemplate.create({
    data: {
      versionName: 'v1.0',
      letterTypeId: typeSK.id,
      schemaDefinition: {
        type: "object",
        required: ["judul_sk", "perihal", "pertimbangan"],
        properties: {
          judul_sk: { type: "string", title: "Judul SK" },
          perihal: { type: "string", title: "Perihal" },
          pertimbangan: { type: "string", title: "Pertimbangan" },
          dasar_hukum: { type: "array", items: { type: "string" }, title: "Dasar Hukum" },
          memutuskan: { type: "string", title: "Memutuskan" }
        }
      },
      formFields: [
        { key: "judul_sk", label: "Judul SK", type: "text", required: true },
        { key: "perihal", label: "Perihal", type: "text", required: true },
        { key: "pertimbangan", label: "Pertimbangan", type: "textarea", required: true },
        { key: "dasar_hukum", label: "Dasar Hukum", type: "array", required: false },
        { key: "memutuskan", label: "Memutuskan", type: "textarea", required: false }
      ],
      contentTemplate: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "SURAT KEPUTUSAN DEKAN" }]
          }
        ]
      },
      isActive: true
    }
  });

  console.log('   ✓ Created Letter Types & Templates');

  // ====================================================================
  // COMPLETE
  // ====================================================================

  console.log('\n' + '━'.repeat(60));
  console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
  console.log('━'.repeat(60));
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function getRoleDescription(role: string): string {
  const descriptions: Record<string, string> = {
    SUPERADMIN: 'Administrator sistem dengan akses penuh',
    MAHASISWA: 'Mahasiswa aktif FSM UNDIP',
    DOSEN: 'Dosen FSM UNDIP',
    KAPRODI: 'Ketua Program Studi',
    ADMIN_PRODI: 'Administrator Program Studi',
    KADEP: 'Ketua Departemen',
    ADMIN_FAKULTAS: 'Administrator Surat Fakultas',
    DEKAN: 'Dekan Fakultas Sains dan Matematika',
    WADEK_1: 'Wakil Dekan I Bidang Akademik',
    WADEK_2: 'Wakil Dekan II Bidang Sumber Daya',
    MANAJER_TU: 'Manajer Tata Usaha',
    SUPERVISOR_AKADEMIK: 'Supervisor Bagian Akademik',
    SUPERVISOR_SUMBER_DAYA: 'Supervisor Bagian Sumber Daya',
    STAF_AKADEMIK: 'Staf Bagian Akademik',
    STAF_SUMBER_DAYA: 'Staf Bagian Sumber Daya',
    UPA: 'Unit Pelaksana Akademik'
  };
  return descriptions[role] || role;
}

// ============================================================================
// RUN SEED
// ============================================================================
main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

