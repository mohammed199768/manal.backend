import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/prisma';
import { ApiResponse } from '../../utils/api-response';
import { AppError } from '../../utils/app-error';
import { Role } from '@prisma/client';

export class AdminStudentsController {
    /**
     * Delete a single student and all associated data (Cascade)
     * DELETE /api/v1/admin/students/:studentId
     */
    async deleteStudent(req: Request, res: Response, next: NextFunction) {
        try {
            const { studentId } = req.params;

            // 1. Verify student exists and is not an admin
            const student = await prisma.user.findUnique({
                where: { id: studentId },
                select: { id: true, role: true, email: true }
            });

            if (!student) {
                throw new AppError('Student not found', 404);
            }

            if (student.role === Role.INSTRUCTOR) {
                throw new AppError('Cannot delete instructor accounts', 403);
            }

            // 2. Delete in correct order to satisfy FK constraints
            // Progress -> Locks -> PaymentRecords -> Enrollments -> User
            await prisma.$transaction(async (tx) => {
                // Delete progress records
                await tx.partProgress.deleteMany({ where: { userId: studentId } });
                
                // Delete enrollment locks
                await tx.enrollmentPartLock.deleteMany({
                    where: { enrollment: { userId: studentId } }
                });
                
                // Delete payment records
                await tx.paymentRecord.deleteMany({
                    where: { enrollment: { userId: studentId } }
                });
                
                // Delete enrollments
                await tx.enrollment.deleteMany({ where: { userId: studentId } });
                
                // Delete password reset tokens
                await tx.passwordResetToken.deleteMany({ where: { userId: studentId } });
                
                // Finally delete the user
                await tx.user.delete({ where: { id: studentId } });
            });

            console.log(`[AdminStudents] Deleted student: ${student.email}`);
            return ApiResponse.success(res, { deletedId: studentId }, 'Student deleted successfully');
        } catch (error) {
            next(error);
        }
    }

    /**
     * Delete ALL students (non-admin users)
     * DELETE /api/v1/admin/students
     * Requires confirmation header: X-Confirm-Delete: DELETE_ALL_STUDENTS
     */
    async deleteAllStudents(req: Request, res: Response, next: NextFunction) {
        try {
            const confirmation = req.headers['x-confirm-delete'];
            
            if (confirmation !== 'DELETE_ALL_STUDENTS') {
                throw new AppError('Missing confirmation header. Set X-Confirm-Delete: DELETE_ALL_STUDENTS', 400);
            }

            // Get all student IDs
            const students = await prisma.user.findMany({
                where: { role: Role.STUDENT },
                select: { id: true }
            });

            const studentIds = students.map(s => s.id);

            if (studentIds.length === 0) {
                return ApiResponse.success(res, { deletedCount: 0 }, 'No students to delete');
            }

            // Bulk delete in transaction
            await prisma.$transaction(async (tx) => {
                await tx.partProgress.deleteMany({ where: { userId: { in: studentIds } } });
                await tx.enrollmentPartLock.deleteMany({
                    where: { enrollment: { userId: { in: studentIds } } }
                });
                await tx.paymentRecord.deleteMany({
                    where: { enrollment: { userId: { in: studentIds } } }
                });
                await tx.enrollment.deleteMany({ where: { userId: { in: studentIds } } });
                await tx.passwordResetToken.deleteMany({ where: { userId: { in: studentIds } } });
                await tx.user.deleteMany({ where: { id: { in: studentIds } } });
            });

            console.log(`[AdminStudents] Deleted ${studentIds.length} students`);
            return ApiResponse.success(res, { deletedCount: studentIds.length }, 'All students deleted');
        } catch (error) {
            next(error);
        }
    }

    /**
     * Clear all enrollments for a specific course
     * DELETE /api/v1/admin/courses/:courseId/enrollments
     */
    async clearCourseEnrollments(req: Request, res: Response, next: NextFunction) {
        try {
            const { courseId } = req.params;

            // Verify course exists
            const course = await prisma.course.findUnique({
                where: { id: courseId },
                select: { id: true, title: true }
            });

            if (!course) {
                throw new AppError('Course not found', 404);
            }

            // Get enrollments for this course
            const enrollments = await prisma.enrollment.findMany({
                where: { courseId },
                select: { id: true }
            });

            const enrollmentIds = enrollments.map(e => e.id);

            if (enrollmentIds.length === 0) {
                return ApiResponse.success(res, { deletedCount: 0 }, 'No enrollments to delete');
            }

            // Delete related data then enrollments
            await prisma.$transaction(async (tx) => {
                // Delete locks for these enrollments
                await tx.enrollmentPartLock.deleteMany({
                    where: { enrollmentId: { in: enrollmentIds } }
                });
                
                // Delete payment records for these enrollments
                await tx.paymentRecord.deleteMany({
                    where: { enrollmentId: { in: enrollmentIds } }
                });
                
                // Delete the enrollments
                await tx.enrollment.deleteMany({ where: { courseId } });
            });

            console.log(`[AdminStudents] Cleared ${enrollmentIds.length} enrollments from course: ${course.title}`);
            return ApiResponse.success(res, { deletedCount: enrollmentIds.length }, 'Course enrollments cleared');
        } catch (error) {
            next(error);
        }
    }
}
