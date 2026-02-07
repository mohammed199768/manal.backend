import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs for auth sensitive endpoints
    message: {
        success: false,
        message: 'Too many attempts, please try again after 15 minutes',
        data: null,
        error: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// POLICY: Public endpoints rate limiter (more permissive than auth)
// Protects public catalog endpoints from scraping/flooding while allowing legitimate browsing + SSR
export const publicRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // POLICY DECISION: 3x more permissive than auth limiter to accommodate SSR pre-fetching
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later',
        data: null,
        error: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
