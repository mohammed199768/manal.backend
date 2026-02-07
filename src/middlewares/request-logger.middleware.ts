import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Extend Express Request to include requestId
declare global {
    namespace Express {
        interface Request {
            requestId?: string;
        }
    }
}

/**
 * Request Logger Middleware
 * - Generates or uses existing X-Request-ID
 * - Logs incoming requests
 * - Logs response completion with status and duration
 */
export const requestLoggerMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    // Generate or use existing request ID
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    req.requestId = requestId;

    // Set response header for tracing
    res.setHeader('X-Request-ID', requestId);

    const startTime = Date.now();
    const { method, originalUrl, path } = req;
    
    // SECURITY: Redact sensitive query parameters from the path
    const fullPath = originalUrl || path;
    const sanitizedPath = fullPath.replace(/([?&]token=)[^&]*/i, '$1[REDACTED]');

    // Log incoming request (minimal info)
    logger.info('Incoming request', {
        requestId,
        method,
        path: sanitizedPath,
    });

    // Log response on finish
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const { statusCode } = res;

        const logContext = {
            requestId,
            method,
            path: sanitizedPath,
            status: statusCode,
            duration: `${duration}ms`,
        };

        if (statusCode >= 500) {
            logger.error('Request completed with server error', logContext);
        } else if (statusCode >= 400) {
            logger.warn('Request completed with client error', logContext);
        } else {
            logger.info('Request completed', logContext);
        }
    });

    next();
};

export default requestLoggerMiddleware;
