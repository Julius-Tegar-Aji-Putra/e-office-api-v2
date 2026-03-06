/**
 * Fix orphaned letters: Letters assigned to staff role but no specific user.
 * After the fix, staff should ONLY see letters explicitly assigned to them.
 * 
 * This script finds letters with currentActiveRole = STAF_AKADEMIK/STAF_SUMBER_DAYA
 * but currentActiveUserId = null, and assigns them to the first user with that role
 * who has acted on the letter (from LetterLog).
 */
import { PrismaClient } from '../src/generated/prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Find orphaned letters
  const orphaned = await prisma.letterInstance.findMany({
    where: {
      currentActiveRole: { in: ['STAF_AKADEMIK', 'STAF_SUMBER_DAYA'] },
      currentActiveUserId: null,
    },
    include: {
      logs: {
        where: {
          actorRole: { in: ['STAF_AKADEMIK', 'STAF_SUMBER_DAYA'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  console.log(`Found ${orphaned.length} orphaned staff letters:\n`);

  if (orphaned.length === 0) {
    console.log('✅ No orphaned letters found. All good!');
    return;
  }

  // Get all staff users as fallback
  const staffUsers = await prisma.user.findMany({
    where: {
      userRoles: { some: { role: { name: { in: ['STAF_AKADEMIK', 'STAF_SUMBER_DAYA'] } } } },
    },
    include: { userRoles: { include: { role: true } } },
  });

  const staffByRole: Record<string, string[]> = {};
  for (const u of staffUsers) {
    for (const ur of u.userRoles) {
      if (!staffByRole[ur.role.name]) staffByRole[ur.role.name] = [];
      staffByRole[ur.role.name].push(u.id);
    }
  }

  for (const letter of orphaned) {
    const role = letter.currentActiveRole!;
    
    // Try to find who last handled this letter as staff
    let assignedUserId: string | null = null;
    
    if (letter.logs.length > 0) {
      assignedUserId = letter.logs[0].actorId;
      console.log(`  📋 Letter ${letter.id} (${letter.status}) — role: ${role}`);
      console.log(`     → Assigning to last handler: ${assignedUserId}`);
    } else {
      // Fallback: assign to first user with matching role
      const candidates = staffByRole[role];
      if (candidates && candidates.length > 0) {
        assignedUserId = candidates[0];
        console.log(`  📋 Letter ${letter.id} (${letter.status}) — role: ${role}`);
        console.log(`     → No handler found, assigning to first ${role}: ${assignedUserId}`);
      } else {
        console.log(`  ⚠️ Letter ${letter.id} — no staff found for role ${role}, skipping`);
        continue;
      }
    }

    if (assignedUserId) {
      await prisma.letterInstance.update({
        where: { id: letter.id },
        data: { currentActiveUserId: assignedUserId },
      });
      console.log(`     ✅ Updated!`);
    }
  }

  console.log('\n🎉 Done fixing orphaned staff letters!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
