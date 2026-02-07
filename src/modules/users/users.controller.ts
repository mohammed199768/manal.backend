import { Request, Response, NextFunction } from 'express';
import { UsersService } from './users.service';
import { ApiResponse } from '../../utils/api-response';

const usersService = new UsersService();

export class UsersController {
    async getMyCourses(req: Request, res: Response, next: NextFunction) {
        try {
            const courses = await usersService.getMyCourses(req.user!.userId);
            return ApiResponse.success(res, courses, 'My courses fetched successfully');
        } catch (error) {
            next(error);
        }
    }



    async getStudentFullDetails(req: Request, res: Response, next: NextFunction) {
        try {
            const { studentId } = req.params;
            const details = await usersService.getStudentFullDetails(studentId);
            return ApiResponse.success(res, details, 'Student full details fetched successfully');
        } catch (error) {
            next(error);
        }
    }


}
