/**
 * Disposisi Routes
 * Route definition untuk /disposisi
 */

import { Hono } from 'hono';
import { DisposisiController } from './disposisi.controller';
import { DisposisiService } from './disposisi.service';
import { DisposisiRepository } from './disposisi.repository';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { roleMiddleware } from '../../shared/middleware/role.middleware';
import { ROLE_GROUPS } from '../../shared/constants/roles';

const disposisiRoutes = new Hono();

const repository = new DisposisiRepository();
const service = new DisposisiService(repository);
const controller = new DisposisiController(service);

disposisiRoutes.use('/*', authMiddleware);

disposisiRoutes.get('/', (c) => controller.list(c));
disposisiRoutes.get('/:id', (c) => controller.getById(c));
disposisiRoutes.post(
  '/',
  roleMiddleware(...ROLE_GROUPS.FAKULTAS_LEADERS),
  (c) => controller.create(c)
);
disposisiRoutes.post('/:id/process', (c) => controller.process(c));

export { disposisiRoutes };
