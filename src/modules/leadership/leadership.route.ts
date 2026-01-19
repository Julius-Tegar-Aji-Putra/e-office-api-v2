/**
 * Leadership Routes
 * Route definition untuk /leadership
 */

import { Hono } from 'hono';
import { LeadershipController } from './leadership.controller';
import { LeadershipService } from './leadership.service';
import { LeadershipRepository } from './leadership.repository';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { roleMiddleware } from '../../shared/middleware/role.middleware';
import { ROLE_GROUPS } from '../../shared/constants/roles';

const leadershipRoutes = new Hono();

const repository = new LeadershipRepository();
const service = new LeadershipService(repository);
const controller = new LeadershipController(service);

leadershipRoutes.use('/*', authMiddleware);
leadershipRoutes.use('/*', roleMiddleware(...ROLE_GROUPS.FAKULTAS_LEADERS));

leadershipRoutes.get('/pending', (c) => controller.listPending(c));
leadershipRoutes.post('/:submissionId/approve', (c) => controller.approve(c));
leadershipRoutes.post('/:submissionId/reject', (c) => controller.reject(c));
leadershipRoutes.post('/:submissionId/redispose', (c) => controller.redispose(c));

export { leadershipRoutes };
