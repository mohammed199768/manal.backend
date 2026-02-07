import { Request, Response, NextFunction } from 'express';
import { ProgressService } from './progress.service';
import { ApiResponse } from '../../utils/api-response';

const service = new ProgressService();

export class ProgressController {
    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const { lessonId } = req.params;
            const { lastPositionSeconds } = req.body;
            // Backward compatibility: Support 'isCompleted' for older clients if needed
            const isCompletedVideo = req.body.isVideoCompleted ?? req.body.isCompleted;

            const result = await service.updateLessonProgress(req.user!.userId, lessonId, lastPositionSeconds, isCompletedVideo);
            return ApiResponse.success(res, result, 'Progress updated');
        } catch (error) {
            next(error);
        }
    }

    async getCourseProgress(req: Request, res: Response, next: NextFunction) {
        try {
            const { courseId } = req.params;
            const result = await service.getCourseProgress(req.user!.userId, courseId);
            return ApiResponse.success(res, result, 'Course progress fetched');
        } catch (error) {
            next(error);
        }
    }
}
