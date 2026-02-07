import dotenv from 'dotenv';
dotenv.config();

import { validateBunnyEnv } from './config/env-validator';
validateBunnyEnv();

// PHASE 10 FIX: Initialize Worker Mechanism
import './workers/pdf.worker';

import { logger } from './utils/logger';
import app from './app';

const port = process.env.PORT || 4000;

// Global unhandled exception handlers
process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception - Process will exit', { processEvent: 'uncaughtException' }, error);
    process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('Unhandled Promise Rejection', { processEvent: 'unhandledRejection' }, error);
});

app.listen(port, () => {
    logger.info('Server started', { port, nodeEnv: process.env.NODE_ENV || 'development' });
});

