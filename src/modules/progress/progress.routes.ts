import { Router } from 'express';
import { ProgressController } from './progress.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();
const controller = new ProgressController();

router.post('/lesson/:lessonId', authMiddleware, requireRole(Role.STUDENT), controller.update);
router.get('/course/:courseId', authMiddleware, requireRole(Role.STUDENT), controller.getCourseProgress);

export default router;
