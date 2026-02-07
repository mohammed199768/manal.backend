import { z } from 'zod';

// Phase 8: V2 Simplified Catalog Schema
// Major/Subject schemas REMOVED

export const createUniversitySchema = z.object({
    name: z.string().min(2).max(255),
    logo: z.string().nullable().optional(), // Allow empty string or undefined
});

export const courseQuerySchema = z.object({
    q: z.string().optional(),
    universityId: z.string().uuid().optional(), // V2: Direct filter
    isFeatured: z.coerce.boolean().optional(),
    isFree: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10), // POLICY: Max 100
    sort: z.enum(['latest', 'featured']).default('latest'),
});

export type CreateUniversityInput = z.infer<typeof createUniversitySchema>;
export type CourseQueryParams = z.infer<typeof courseQuerySchema>;
