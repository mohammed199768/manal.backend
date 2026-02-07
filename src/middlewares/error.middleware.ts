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
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let errorDetails = null;

    // Build sanitized context for logging
    const logContext = {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl || req.path,
        userRole: (req as any).user?.role, // If user attached by auth middleware
    };

    if (err instanceof ZodError) {
        statusCode = 400;
        message = 'Validation Error';
        errorDetails = err.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
        }));
        logger.warn('Validation error', { ...logContext, validationErrors: errorDetails });
    } else if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        if (statusCode >= 500) {
            logger.error('Application error', logContext, err);
        } else {
            logger.warn('Application error', { ...logContext, status: statusCode, message });
        }
    } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Handle unique constraint violations
        if (err.code === 'P2002') {
            statusCode = 409;
            message = 'A record with this value already exists (Unique constraint failed)';
            errorDetails = err.meta;
        } else if (err.code === 'P2025') {
            statusCode = 404;
            message = 'Record not found';
        } else {
            statusCode = 400;
            message = `Database Error: ${err.message}`;
        }
        logger.warn('Database error', { ...logContext, prismaCode: err.code, status: statusCode });
    } else {
        // Log unexpected errors with full stack trace
        logger.error('Unhandled error', logContext, err);
        if (process.env.NODE_ENV === 'production') {
            message = 'Internal Server Error';
        } else {
            errorDetails = {
                stack: err.stack,
                ...err
            };
        }
    }

    ApiResponse.error(res, errorDetails, message, statusCode);
};

