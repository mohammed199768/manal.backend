import { Router } from 'express';
import { UsersController } from './users.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { Role } from '@prisma/client';

const router = Router();
const usersController = new UsersController();

// Student routes
router.get('/me/courses', authMiddleware, usersController.getMyCourses);


// Admin routes
router.get(
    '/admin/students/:studentId/full-details',
    authMiddleware,
    requireRole(Role.INSTRUCTOR), // Admin is often an instructor or has instructor role in this simplified schema
    usersController.getStudentFullDetails
);



export default router;
