import { Response } from 'express';

export class ApiResponse {
    static success(res: Response, data: any, message: string = 'Success', statusCode: number = 200) {
        return res.status(statusCode).json({
            success: true,
            message,
            data,
            error: null,
        });
    }

    static error(res: Response, error: any, message: string = 'Error', statusCode: number = 500) {
        return res.status(statusCode).json({
            success: false,
            message,
            data: null,
            error,
        });
    }
}
