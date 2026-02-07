import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';
import prisma from '../config/prisma';

/**
 * Middleware to enforce that the user has verified their email address.
 * Must be used AFTER authMiddleware.
 */
export const verifiedGate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            throw new AppError('Authentication required', 401);
        }

        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { emailVerifiedAt: true },
        });

        if (!user || !user.emailVerifiedAt) {
            throw new AppError('Email verification required to access this feature', 403);
        }

        next();
    } catch (error) {
        next(error);
    }
};
