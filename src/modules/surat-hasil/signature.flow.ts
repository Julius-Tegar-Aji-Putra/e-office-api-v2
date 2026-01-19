/**
 * Signature Flow
 * Core logic tanda tangan BERURUTAN (sequential)
 */

import { HasilRepository } from './hasil.repository';
import { SIGNATURE_STATUS } from '../../shared/constants/status';

export async function processSignatureFlow(suratHasilId: string, repository: HasilRepository) {
  // Get all signatures for this document
  const signatures = await repository.getSignatureQueue(suratHasilId);
  
  // Check if all signatures are completed
  const allSigned = signatures.every((sig: any) => sig.status === SIGNATURE_STATUS.SIGNED);
  
  if (allSigned) {
    // All signatures completed, mark document as ready for legalisasi
    await repository.updateSuratHasil(suratHasilId, {
      status: 'SIGNED_COMPLETE',
      completedAt: new Date(),
    });
    
    return { 
      completed: true, 
      message: 'Semua tanda tangan selesai, siap untuk legalisasi' 
    };
  }
  
  // Get next pending signature
  const nextSigner = signatures.find((sig: any) => sig.status === SIGNATURE_STATUS.PENDING);
  
  if (nextSigner) {
    // TODO: Send notification to next signer
    return {
      completed: false,
      message: 'Tanda tangan berhasil, menunggu tanda tangan berikutnya',
      nextSigner: {
        userId: nextSigner.userId,
        name: nextSigner.user.name,
        order: nextSigner.order,
      },
    };
  }
  
  return { completed: false, message: 'Proses tanda tangan berlanjut' };
}
