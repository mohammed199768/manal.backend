import { Router } from 'express';
import { ProgressController } from './progress.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireStudentRole } from '../../middlewares/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();
const controller = new ProgressController();

router.post('/lesson/:lessonId', authMiddleware, requireStudentRole, controller.update);
router.get('/course/:courseId', authMiddleware, requireStudentRole, controller.getCourseProgress);

export default router;
