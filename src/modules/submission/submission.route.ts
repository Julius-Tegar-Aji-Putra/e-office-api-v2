/**
 * Submission Routes
 * Route definition untuk /submission
 */

import { Hono } from 'hono';
import { SubmissionController } from './submission.controller';
import { SubmissionService } from './submission.service';
import { SubmissionRepository } from './submission.repository';
import { authMiddleware } from '../../shared/middleware/auth.middleware';
import { roleMiddleware } from '../../shared/middleware/role.middleware';
import { ROLES } from '../../shared/constants/roles';

const submissionRoutes = new Hono();

// Initialize dependencies
const repository = new SubmissionRepository();
const service = new SubmissionService(repository);
const controller = new SubmissionController(service);

// Apply auth middleware to all routes
submissionRoutes.use('/*', authMiddleware);

// Routes
submissionRoutes.get('/', (c) => controller.list(c));
submissionRoutes.get('/:id', (c) => controller.getById(c));
submissionRoutes.post('/', roleMiddleware(ROLES.PEMOHON), (c) => controller.create(c));
submissionRoutes.put('/:id', roleMiddleware(ROLES.PEMOHON), (c) => controller.update(c));
submissionRoutes.post('/:id/submit', roleMiddleware(ROLES.PEMOHON), (c) => controller.submit(c));
submissionRoutes.delete('/:id', roleMiddleware(ROLES.PEMOHON), (c) => controller.delete(c));

export { submissionRoutes };
