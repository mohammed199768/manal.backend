import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/app-error';
import { ApiResponse } from '../utils/api-response';
import { logger } from '../utils/logger';

import { Prisma } from '@prisma/client';

export const errorMiddleware = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const isProd = process.env.NODE_ENV === 'production';
    
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let errorDetails: any = isProd ? null : err;

    // Prisma Handling
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
            statusCode = 409;
            message = 'السجل موجود مسبقاً'; // 'Conflict'
            errorDetails = isProd ? null : err.meta;
        } else if (err.code === 'P2025') {
            statusCode = 404;
            message = 'Record not found';
            // P2025 details are usually safe-ish, but let's follow the general rule if needed, 
            // but user asked specifically for "Other Prisma errors" rules below. 
            // P2025 usually keeps its details unless 500 rule hits.
        } else {
            // Any other Prisma error (not P2002, not P2025)
            statusCode = 400;
            message = 'Bad Request';
            // Force null validation for production on generic prisma errors
            if (isProd) {
                errorDetails = null;
            }
        }
    } else if (err instanceof ZodError) {
        statusCode = 400;
        message = 'Validation Error';
        errorDetails = err.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
        }));
    } else if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        // AppErrors are trusted, but bounded by the Golden Rule below
    }

    // Build sanitized context for logging
    const logContext = {
        requestId: (req as any).requestId,
        method: req.method,
        path: req.originalUrl || req.path,
        userRole: (req as any).user?.role,
        statusCode,
    };

    // Logging Logic
    if (statusCode >= 500) {
        logger.error(message, logContext, err);
    } else {
        logger.warn(message, { ...logContext, errorDetails });
    }

    // Golden Rule: In Production, if status >= 500, Force Generic Message
    if (isProd && statusCode >= 500) {
        message = 'Internal Server Error';
        errorDetails = null;
    }

    ApiResponse.error(res, errorDetails, message, statusCode);
};

