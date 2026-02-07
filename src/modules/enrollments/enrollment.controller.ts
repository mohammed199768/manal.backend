import { Request, Response, NextFunction } from 'express';
import { EnrollmentService } from './enrollment.service';
import { ApiResponse } from '../../utils/api-response';

const enrollmentService = new EnrollmentService();

export class EnrollmentController {
    // POST /api/v1/enrollments/:courseId/request
    async requestEnrollment(req: Request, res: Response, next: NextFunction) {
        try {
            const { courseId } = req.params;
            const enrollment = await enrollmentService.createEnrollment(req.user!.userId, courseId);
             // 201 Created
            return ApiResponse.success(res, enrollment, 'Enrollment request created. Please contact admin to complete payment.', 201);
        } catch (error) {
            next(error);
        }
    }
}
