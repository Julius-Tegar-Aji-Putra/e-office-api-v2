/**
 * Legalisasi Routes
 * Route definition untuk /legalisasi
 */

import { Hono } from 'hono';
import { LegalisasiController } from './legalisasi.controller';
import { LegalisasiService } from './legalisasi.service';
import { LegalisasiRepository } from './legalisasi.repository';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { roleMiddleware } from '../../shared/middleware/role.middleware';
import { ROLES } from '../../shared/constants/roles';

const legalisasiRoutes = new Hono();

const repository = new LegalisasiRepository();
const service = new LegalisasiService(repository);
const controller = new LegalisasiController(service);

legalisasiRoutes.use('/*', authMiddleware);
legalisasiRoutes.use('/*', roleMiddleware(ROLES.UPA, ROLES.ADMIN));

legalisasiRoutes.get('/pending', (c) => controller.listPending(c));
legalisasiRoutes.get('/archive', (c) => controller.archive(c));
legalisasiRoutes.get('/:id', (c) => controller.getById(c));
legalisasiRoutes.post('/:suratHasilId/process', (c) => controller.process(c));
legalisasiRoutes.post('/:id/distribute', (c) => controller.distribute(c));

export { legalisasiRoutes };
