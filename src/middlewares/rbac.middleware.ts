import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error';

export const requireRole = (...roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return next(new AppError('Unauthorized', 401));
        }

        // START: Role Unification Alias Logic (Single-ADMIN)
        // We treat legacy 'INSTRUCTOR' role as 'ADMIN' for authorization checks.
        // This allows existing users (Enum: INSTRUCTOR) to pass 'ADMIN' guards.
        const effectiveRoles: string[] = [req.user?.role || '']; // Ensure array of strings
        if (req.user?.role === 'INSTRUCTOR') {
            effectiveRoles.push('ADMIN');
        }

        const hasPermission = roles.some(requiredRole => effectiveRoles.includes(requiredRole));

        if (!hasPermission) {
            return next(new AppError('Forbidden: Insufficient permissions', 403));
        }
        // END: Role Unification Alias Logic

        next();
    };
};
