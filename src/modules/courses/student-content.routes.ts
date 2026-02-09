import { Router } from 'express';
import { StudentContentController } from './student-content.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireAnyRole } from '../../middlewares/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();
const controller = new StudentContentController();

router.get('/:courseId/content', authMiddleware, requireAnyRole, controller.getContent);
router.get('/assets/:assetId/play', authMiddleware, requireAnyRole, controller.getPlayback);
router.get('/assets/:assetId/refresh', authMiddleware, requireAnyRole, controller.getRefresh);

export default router;
