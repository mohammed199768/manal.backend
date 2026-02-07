import { z } from 'zod';
import { PaymentStatus, PaymentProvider } from '@prisma/client';

export const listPaymentsSchema = z.object({
    page: z.string().optional().transform(val => (val ? parseInt(val, 10) : 1)).pipe(z.number().min(1)),
    limit: z.string().optional().transform(val => (val ? parseInt(val, 10) : 20)).pipe(z.number().min(1).max(100)),
    courseId: z.string().uuid().optional(),
    status: z.nativeEnum(PaymentStatus).optional(),
    provider: z.nativeEnum(PaymentProvider).optional(),
});
