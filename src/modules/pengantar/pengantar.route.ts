/**
 * Pengantar Routes
 * Route definition untuk /pengantar
 */

import { Hono } from 'hono';
import { PengantarController } from './pengantar.controller';
import { PengantarService } from './pengantar.service';
import { PengantarRepository } from './pengantar.repository';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { roleMiddleware } from '../../shared/middleware/role.middleware';
import { ROLES, ROLE_GROUPS } from '../../shared/constants/roles';

const pengantarRoutes = new Hono();

// Initialize dependencies
const repository = new PengantarRepository();
const service = new PengantarService(repository);
const controller = new PengantarController(service);

// Apply auth middleware
pengantarRoutes.use('/*', authMiddleware);

// Routes
pengantarRoutes.get('/', (c) => controller.list(c));
pengantarRoutes.get('/:id', (c) => controller.getById(c));

pengantarRoutes.post(
  '/:submissionId/generate',
  roleMiddleware(...ROLE_GROUPS.PRODI_LEADERS),
  (c) => controller.generateFromProdi(c)
);

pengantarRoutes.post(
  '/:id/approve',
  roleMiddleware(...ROLE_GROUPS.ALL_LEADERS),
  (c) => controller.approve(c)
);

pengantarRoutes.post(
  '/:id/reject',
  roleMiddleware(...ROLE_GROUPS.ALL_LEADERS),
  (c) => controller.reject(c)
);

export { pengantarRoutes };
