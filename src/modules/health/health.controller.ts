import { Request, Response } from 'express';
import prisma from '../../config/prisma';
import { ApiResponse } from '../../utils/api-response';
import { getMemoryUsage } from '../../utils/memory-monitor';
import Redis from 'ioredis';

export class HealthController {
    public check = async (req: Request, res: Response) => {
        const healthStatus = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            services: {
                database: 'unknown',
                redis: 'unknown'
            },
            memory: getMemoryUsage()
        };

        let statusCode = 200;

        // Check Database
        try {
            await prisma.$queryRaw`SELECT 1`;
            healthStatus.services.database = 'connected';
        } catch (error) {
            healthStatus.services.database = 'disconnected';
            healthStatus.status = 'error';
            statusCode = 503;
        }

        // Check Redis (if configured)
        if (process.env.REDIS_URL) {
            try {
                const redis = new Redis(process.env.REDIS_URL, {
                    connectTimeout: 2000,
                    maxRetriesPerRequest: 1
                });
                await redis.ping();
                healthStatus.services.redis = 'connected';
                redis.disconnect();
            } catch (error) {
                healthStatus.services.redis = 'disconnected';
                // Don't degrade overall status for Redis if it's optional cache
                // But for rate limiting it IS critical.
                healthStatus.status = 'degraded'; 
            }
        } else {
             healthStatus.services.redis = 'not-configured';
        }

        return res.status(statusCode).json(healthStatus);
    };
}
