import { Router } from 'express';
import { EnrollmentController } from './enrollment.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { verifiedGate } from '../../middlewares/verified-gate.middleware';
import { requireStudentRole } from '../../middlewares/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();
const controller = new EnrollmentController();

router.post('/:courseId/request', authMiddleware, verifiedGate, requireStudentRole, controller.requestEnrollment.bind(controller));

export default router;
