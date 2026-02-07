import { Request, Response, NextFunction } from 'express';
import prisma from '../../config/prisma';
import { AppError } from '../../utils/app-error';

export class AdminLocksController {
    /**
     * Toggle lock status for a specific part in an enrollment.
     * If lock exists, it toggles isLocked.
     * If not, it creates a new lock with isLocked = true.
     */
    async toggleLock(req: Request, res: Response, next: NextFunction) {
        try {
            const { enrollmentId, partId } = req.body;

            if (!enrollmentId || !partId) {
                return next(new AppError('EnrollmentId and PartId are required', 400));
            }

            // Check if lock exists using findUnique (composite key)
            const existingLock = await prisma.enrollmentPartLock.findUnique({
                where: {
                    enrollmentId_partId: {
                        enrollmentId,
                        partId
                    }
                }
            });

            let result;

            if (existingLock) {
                // Toggle
                result = await prisma.enrollmentPartLock.update({
                    where: { id: existingLock.id },
                    data: { isLocked: !existingLock.isLocked }
                });
            } else {
                // Create new lock (default isLocked=true)
                result = await prisma.enrollmentPartLock.create({
                    data: {
                        enrollmentId,
                        partId,
                        isLocked: true,
                        reason: 'Admin Manual Lock'
                    }
                });
            }

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get all locks for a specific enrollment.
     */
    async getEnrollmentLocks(req: Request, res: Response, next: NextFunction) {
        try {
            const { enrollmentId } = req.params;

            const locks = await prisma.enrollmentPartLock.findMany({
                where: { enrollmentId }
            });

            res.status(200).json({
                success: true,
                data: locks
            });
        } catch (error) {
            next(error);
        }
    }
}
