/**
 * Hasil Routes
 * Route definition untuk /surat-hasil
 */

import { Hono } from 'hono';
import { HasilController } from './hasil.controller';
import { HasilService } from './hasil.service';
import { HasilRepository } from './hasil.repository';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { roleMiddleware } from '../../shared/middleware/role.middleware';
import { ROLE_GROUPS } from '../../shared/constants/roles';

const hasilRoutes = new Hono();

const repository = new HasilRepository();
const service = new HasilService(repository);
const controller = new HasilController(service);

hasilRoutes.use('/*', authMiddleware);

hasilRoutes.get('/', (c) => controller.list(c));
hasilRoutes.get('/:id', (c) => controller.getById(c));
hasilRoutes.get('/:id/signatures', (c) => controller.getSignatureQueue(c));

hasilRoutes.post(
  '/:submissionId/generate',
  roleMiddleware(...ROLE_GROUPS.FAKULTAS_LEADERS),
  (c) => controller.generate(c)
);

hasilRoutes.post('/:id/sign', (c) => controller.sign(c));

export { hasilRoutes };
