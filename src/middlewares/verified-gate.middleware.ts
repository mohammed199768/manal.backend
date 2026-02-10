import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';
import prisma from '../config/prisma';
import { getUserIdFromClaims } from '../utils/auth-claims';

/**
 * Middleware to enforce that the user has verified their email address.
 * Must be used AFTER authMiddleware.
 * 
 * FAIL-SAFE:
 * 1. Extracts canonical User ID via helper (handles userId/id/sub).
 * 2. Fetches fresh { emailVerifiedAt, role } from DB.
 * 3. Syncs req.user.role = db.role (Overrides stale token role).
 * 4. Logs denials for easier debugging.
 */
export const verifiedGate = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 1. Get Canonical User ID
        const userId = getUserIdFromClaims(req.user);

        // 2. Fetch fresh status from DB
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { 
                emailVerifiedAt: true,
                role: true, // Sync role for RBAC
            },
        });

        // Diagnostic Log (Keep until confirmed fixed)
        console.log(`[VerifiedGate] User: ${userId}, Verified: ${!!user?.emailVerifiedAt}, Role: ${user?.role}`);

        if (!user || user.emailVerifiedAt === null || user.emailVerifiedAt === undefined) {
            console.error(`[VerifiedGate] DENIED 403: User ${userId} is not verified.`);
            throw new AppError('Email verification required to access this feature', 403);
        }

        // 3. Sync Role to Request Object (Authoritative Source)
        if (req.user) {
            req.user.userId = userId; // Normalize ID for downstream controllers
            req.user.role = user.role;
        }

        next();
    } catch (error) {
        next(error);
    }
};
