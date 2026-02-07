import { Request, Response, NextFunction } from 'express';
import { InstructorPaymentsService } from './instructor-payments.service';
import { listPaymentsSchema } from './instructor-payments.schema';
import { ApiResponse } from '../../utils/api-response';

const service = new InstructorPaymentsService();

export class InstructorPaymentsController {
    async listPayments(req: Request, res: Response, next: NextFunction) {
        try {
            const query = listPaymentsSchema.parse(req.query);
            const result = await service.listPayments(req.user!.userId, query);
            return ApiResponse.success(res, result, 'Payments fetched');
        } catch (error) {
            next(error);
        }
    }

    async getRevenueSummary(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await service.getRevenueSummary(req.user!.userId);
            return ApiResponse.success(res, result, 'Revenue summary fetched');
        } catch (error) {
            next(error);
        }
    }
}
