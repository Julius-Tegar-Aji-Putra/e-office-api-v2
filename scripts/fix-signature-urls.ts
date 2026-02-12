/**
 * Migration Script: Fix DocumentSignature records with expired presigned URLs
 * 
 * Problem: Some DocumentSignature records stored presigned MinIO URLs
 * (http://localhost:9000/e-office-storage/signatures/...?X-Amz-...) 
 * instead of storage paths (signatures/userId/2026/02/file.jpeg).
 * Presigned URLs expire after 1 hour, making signatures disappear.
 * 
 * Solution: Extract the storage path from the presigned URL and update the record.
 * 
 * Usage: bun run scripts/fix-signature-urls.ts
 * 
 * Modes:
 *   --dry-run  (default) Show what would be changed without making changes
 *   --apply    Actually apply the fixes
 */

/// <reference types="node" />

import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();

const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'e-office-storage';

/**
 * Extract storage path from a presigned URL
 * E.g. "http://localhost:9000/e-office-storage/signatures/userId/2026/02/file.jpeg?X-Amz-..."
 *   -> "signatures/userId/2026/02/file.jpeg"
 */
function extractStoragePath(url: string): string | null {
  if (!url.startsWith('http')) {
    // Already a storage path
    return null;
  }

  try {
    const parsed = new URL(url);
    let pathname = decodeURIComponent(parsed.pathname);

    // Remove leading slash
    if (pathname.startsWith('/')) {
      pathname = pathname.substring(1);
    }

    // Remove bucket name prefix if present
    if (pathname.startsWith(`${BUCKET_NAME}/`)) {
      pathname = pathname.substring(BUCKET_NAME.length + 1);
    }

    // Validate we got something meaningful
    if (pathname && pathname.length > 0 && pathname !== BUCKET_NAME) {
      return pathname;
    }

    return null;
  } catch {
    console.error(`  ❌ Failed to parse URL: ${url.substring(0, 80)}...`);
    return null;
  }
}

async function main() {
  const isDryRun = !process.argv.includes('--apply');

  console.log('='.repeat(70));
  console.log('Fix DocumentSignature presigned URLs → storage paths');
  console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no changes)' : '⚡ APPLY (will update records)'}`);
  console.log('='.repeat(70));

  // Find all DocumentSignature records where signatureUrl starts with 'http'
  const signatures = await prisma.documentSignature.findMany({
    where: {
      signatureUrl: {
        not: null,
      }
    },
    select: {
      id: true,
      signatureUrl: true,
      signerRole: true,
      signerName: true,
      document: {
        select: {
          id: true,
          type: true,
          letterInstance: {
            select: {
              id: true,
              status: true,
            }
          }
        }
      }
    }
  });

  console.log(`\nFound ${signatures.length} total DocumentSignature records with signatureUrl\n`);

  let fixable = 0;
  let alreadyCorrect = 0;
  let unfixable = 0;
  let fixed = 0;

  for (const sig of signatures) {
    if (!sig.signatureUrl) continue;

    // Already a storage path (correct)
    if (!sig.signatureUrl.startsWith('http')) {
      alreadyCorrect++;
      continue;
    }

    // This is a presigned URL — needs fixing
    const storagePath = extractStoragePath(sig.signatureUrl);

    if (!storagePath) {
      unfixable++;
      console.log(`  ⚠️  [${sig.id}] ${sig.signerRole} (${sig.signerName}) - Could not extract path from:`);
      console.log(`      ${sig.signatureUrl.substring(0, 100)}...`);
      continue;
    }

    fixable++;
    console.log(`  🔧 [${sig.id}] ${sig.signerRole} (${sig.signerName})`);
    console.log(`      Letter: ${sig.document.letterInstance?.id} (${sig.document.letterInstance?.status})`);
    console.log(`      FROM: ${sig.signatureUrl.substring(0, 80)}...`);
    console.log(`      TO:   ${storagePath}`);

    if (!isDryRun) {
      await prisma.documentSignature.update({
        where: { id: sig.id },
        data: { signatureUrl: storagePath }
      });
      fixed++;
      console.log(`      ✅ Updated!`);
    }

    console.log('');
  }

  // Also fix SavedSignature records that might have presigned URLs
  const savedSignatures = await prisma.savedSignature.findMany({
    where: {
      fileUrl: {
        startsWith: 'http'
      }
    },
    select: {
      id: true,
      fileUrl: true,
      alias: true,
      userId: true,
    }
  });

  if (savedSignatures.length > 0) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`Found ${savedSignatures.length} SavedSignature records with presigned URLs\n`);

    for (const saved of savedSignatures) {
      const storagePath = extractStoragePath(saved.fileUrl);
      if (!storagePath) {
        unfixable++;
        console.log(`  ⚠️  [${saved.id}] "${saved.alias}" - Could not extract path`);
        continue;
      }

      fixable++;
      console.log(`  🔧 [${saved.id}] "${saved.alias}" (user: ${saved.userId})`);
      console.log(`      FROM: ${saved.fileUrl.substring(0, 80)}...`);
      console.log(`      TO:   ${storagePath}`);

      if (!isDryRun) {
        await prisma.savedSignature.update({
          where: { id: saved.id },
          data: { fileUrl: storagePath }
        });
        fixed++;
        console.log(`      ✅ Updated!`);
      }

      console.log('');
    }
  }

  console.log('='.repeat(70));
  console.log('Summary:');
  console.log(`  ✅ Already correct (storage paths): ${alreadyCorrect}`);
  console.log(`  🔧 Fixable (presigned URLs):        ${fixable}`);
  console.log(`  ⚠️  Unfixable:                       ${unfixable}`);
  if (!isDryRun) {
    console.log(`  ✅ Fixed:                            ${fixed}`);
  }
  console.log('='.repeat(70));

  if (isDryRun && fixable > 0) {
    console.log('\n💡 Run with --apply to actually fix the records:');
    console.log('   bun run scripts/fix-signature-urls.ts --apply\n');
  }

  await prisma.$disconnect();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Script failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
