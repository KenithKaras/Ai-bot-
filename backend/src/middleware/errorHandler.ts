import type { Request, Response, NextFunction } from 'express';

export interface AppErrorResponse {
  error: {
    message: string;
    code: string;
    status: number;
    details?: any;
  };
}

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  const rawMessage = err.message || 'An unexpected internal server error occurred';

  // Scrub any accidental token/secret leaks in message
  const safeMessage = rawMessage
    .replace(/cc_[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, 'Bearer [REDACTED]');

  const code = err.code || (status === 404 ? 'NOT_FOUND' : status === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR');

  // Log error safely without dumping headers, tokens, or private conversation content
  console.error(`[Error] [${code}] Status: ${status} - ${safeMessage}`);

  res.status(status).json({
    error: {
      message: safeMessage,
      code,
      status,
    },
  });
};
