import { Router } from 'express';
import { InstructorPaymentsController } from './instructor-payments.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();
const controller = new InstructorPaymentsController();

router.get('/summary', authMiddleware, requireRole('INSTRUCTOR'), controller.getRevenueSummary);
router.get('/', authMiddleware, requireRole('INSTRUCTOR'), controller.listPayments);

export default router;
