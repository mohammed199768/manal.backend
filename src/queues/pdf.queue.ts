import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// Support Railway REDIS_URL with TLS (rediss://)
const connection = process.env.REDIS_URL
  ? new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      // Enable TLS for rediss:// URLs (Railway Redis)
      tls: process.env.REDIS_URL.startsWith('rediss://') ? {} : undefined,
    })
  : new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    });

export const pdfQueue = new Queue('pdf-processing', { connection });
