import { Router } from 'express';
import { StudentContentController } from './student-content.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();
const controller = new StudentContentController();

router.get('/:courseId/content', authMiddleware, requireRole(Role.STUDENT, Role.INSTRUCTOR), controller.getContent);
router.get('/assets/:assetId/play', authMiddleware, requireRole(Role.STUDENT, Role.INSTRUCTOR), controller.getPlayback);
router.get('/assets/:assetId/refresh', authMiddleware, requireRole(Role.STUDENT, Role.INSTRUCTOR), controller.getRefresh);

export default router;
