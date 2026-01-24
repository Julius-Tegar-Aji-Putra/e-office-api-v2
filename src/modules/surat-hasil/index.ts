/**
 * Surat Hasil Module Index
 * Barrel export untuk modul surat hasil (SK/ST)
 * 
 * Modul ini adalah shared service untuk:
 * - Generate Dokumen (Draft SK/ST)
 * - Bubuh Tanda Tangan (Signing)
 */

// Types
export * from './hasil.types';

// Repository
export { hasilRepository } from './hasil.repository';
export { signingRepository } from './signing.repository';

// Service
export { hasilService } from './hasil.service';
export { signingService } from './signing.service';

// Controller
export { hasilController } from './hasil.controller';
export { signingController } from './signing.controller';

// Routes
export { hasilRoutes } from './hasil.route';
export { signingRoutes } from './signing.route';

// Validation
export * from './hasil.validation';
export * from './signing.validation';
