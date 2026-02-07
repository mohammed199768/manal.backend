import { Request, Response, NextFunction } from 'express';
import { StudentContentService } from './student-content.service';
import { ApiResponse } from '../../utils/api-response';

const service = new StudentContentService();

export class StudentContentController {
    async getContent(req: Request, res: Response, next: NextFunction) {
        try {
            const { courseId } = req.params;
            const data = await service.getCourseContent(req.user!.userId, courseId);
            return ApiResponse.success(res, data, 'Course content fetched');
        } catch (error) {
            next(error);
        }
    }

    async getPlayback(req: Request, res: Response, next: NextFunction) {
        try {
            const { assetId } = req.params;
            const data = await service.getAssetPlayback(req.user!.userId, assetId);
            return ApiResponse.success(res, data, 'Playback info fetched');
        } catch (error) {
            next(error);
        }
    }

    async getRefresh(req: Request, res: Response, next: NextFunction) {
        try {
            const { assetId } = req.params;
            const data = await service.getAssetRefresh(req.user!.userId, assetId);
            return ApiResponse.success(res, data, 'Playback token refreshed');
        } catch (error) {
            next(error);
        }
    }
}
