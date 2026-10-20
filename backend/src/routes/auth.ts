import { Router, type Request, type Response, type NextFunction } from 'express';
import { authService, AuthError } from '../services/authService.js';
import {
  setSessionCookie,
  clearSessionCookie,
  extractSessionId,
  extractRefreshToken,
  requireAuth,
} from '../middleware/authMiddleware.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';

export const authRouter = Router();

/**
 * Register a new user
 * POST /api/auth/register
 */
authRouter.post(
  '/register',
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, confirmPassword, name } = req.body || {};

      if (!email || !password || !name) {
        res.status(400).json({
          error: {
            message: 'Email, password, and name are required.',
            code: 'MISSING_FIELDS',
            status: 400,
          },
        });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const { user, session } = await authService.register({
        email,
        password,
        confirmPassword,
        name,
        ipAddress,
        userAgent,
      });

      // Set secure HTTP-only cookies (session + refresh)
      setSessionCookie(res, session.id, session.refreshToken);

      res.status(201).json({
        user,
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
          refreshToken: session.refreshToken,
        },
      });
    } catch (err: any) {
      if (err instanceof AuthError) {
        res.status(err.statusCode).json({
          error: {
            message: err.message,
            code: err.code,
            status: err.statusCode,
          },
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * Log in an existing user
 * POST /api/auth/login
 */
authRouter.post(
  '/login',
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        res.status(400).json({
          error: {
            message: 'Email and password are required.',
            code: 'MISSING_CREDENTIALS',
            status: 400,
          },
        });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const { user, session } = await authService.login({
        email,
        password,
        ipAddress,
        userAgent,
      });

      // Set secure HTTP-only cookies (session + refresh)
      setSessionCookie(res, session.id, session.refreshToken);

      res.status(200).json({
        user,
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
          refreshToken: session.refreshToken,
        },
      });
    } catch (err: any) {
      if (err instanceof AuthError) {
        res.status(err.statusCode).json({
          error: {
            message: err.message,
            code: err.code,
            status: err.statusCode,
          },
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * Refresh user session using refresh token
 * POST /api/auth/refresh
 */
authRouter.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = extractRefreshToken(req);
      const sessionId = extractSessionId(req);

      if (!refreshToken && !sessionId) {
        res.status(400).json({
          error: {
            message: 'Refresh token or active session is required.',
            code: 'MISSING_TOKEN',
            status: 400,
          },
        });
        return;
      }

      const { user, session } = await authService.refreshSession(
        refreshToken || sessionId!,
        sessionId || undefined
      );

      setSessionCookie(res, session.id, session.refreshToken);

      res.status(200).json({
        user,
        session: {
          id: session.id,
          expiresAt: session.expiresAt,
          refreshToken: session.refreshToken,
        },
      });
    } catch (err: any) {
      if (err instanceof AuthError) {
        res.status(err.statusCode).json({
          error: {
            message: err.message,
            code: err.code,
            status: err.statusCode,
          },
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * Log out user and destroy session
 * POST /api/auth/logout
 */
authRouter.post(
  '/logout',
  async (req: Request, res: Response): Promise<void> => {
    const sessionId = extractSessionId(req);
    const refreshToken = extractRefreshToken(req);

    if (sessionId || refreshToken) {
      await authService.revokeSession(sessionId || '', refreshToken || undefined);
    }

    clearSessionCookie(res);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  }
);

/**
 * Get current authenticated user profile
 * GET /api/auth/me
 */
authRouter.get(
  '/me',
  requireAuth,
  (req: Request, res: Response): void => {
    res.status(200).json({
      user: req.user,
      session: req.session,
    });
  }
);

/**
 * Protected route verification endpoint
 * GET /api/auth/protected
 */
authRouter.get(
  '/protected',
  requireAuth,
  (req: Request, res: Response): void => {
    res.status(200).json({
      message: 'Access granted to protected resource.',
      userId: req.user!.id,
    });
  }
);
