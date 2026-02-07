import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../../utils/app-error';

export const validate = (schema: ZodSchema) => async (req: Request, res: Response, next: NextFunction) => {
    try {
        await schema.parseAsync({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    } catch (error) {
        if (error instanceof ZodError) {
            const message = error.issues.map((e) => `${e.path.join('.')} : ${e.message}`).join(', ');
            next(new AppError(message, 400));
        } else {
            next(error);
        }
    }
};
