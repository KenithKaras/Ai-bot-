import type { Request, Response, NextFunction } from 'express';
import { ZodError, type ZodSchema } from 'zod';

export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));

        res.status(400).json({
          error: {
            message: 'Invalid request payload: ' + issues.map((i) => i.message).join(', '),
            code: 'VALIDATION_ERROR',
            details: issues,
            status: 400,
          },
        });
        return;
      }
      next(err);
    }
  };
};

export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: {
            message: 'Invalid URL parameters',
            code: 'VALIDATION_ERROR',
            details: err.issues,
            status: 400,
          },
        });
        return;
      }
      next(err);
    }
  };
};
