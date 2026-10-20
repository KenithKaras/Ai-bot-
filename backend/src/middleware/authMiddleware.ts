import type { Request, Response, NextFunction } from 'express';
import { authService, SESSION_TTL_MS, type SafeUser, type SafeSession } from '../services/authService.js';
import { config } from '../config.js';
import { getSupabaseAdmin } from '../services/supabaseClient.js';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      session?: SafeSession;
    }
  }
}

export const SESSION_COOKIE_NAME = 'radox_session';
export const REFRESH_COOKIE_NAME = 'radox_refresh';
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const setSessionCookie = (res: Response, sessionId: string, refreshToken?: string): void => {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });

  if (refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: REFRESH_TTL_MS,
      path: '/',
    });
  }
};

export const clearSessionCookie = (res: Response): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  });
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  });
};

export const extractSessionId = (req: Request): string | null => {
  // 1. From Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. From HTTP-only Cookie
  if (req.cookies && req.cookies[SESSION_COOKIE_NAME]) {
    return req.cookies[SESSION_COOKIE_NAME];
  }

  // 3. From X-Session-Id header
  const customHeader = req.headers['x-session-id'];
  if (typeof customHeader === 'string') {
    return customHeader.trim();
  }

  return null;
};

export const extractRefreshToken = (req: Request): string | null => {
  // 1. From Request Body
  if (req.body && typeof req.body.refreshToken === 'string' && req.body.refreshToken.trim()) {
    return req.body.refreshToken.trim();
  }

  // 2. From HTTP-only Refresh Cookie
  if (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) {
    return req.cookies[REFRESH_COOKIE_NAME];
  }

  // 3. From X-Refresh-Token header
  const headerToken = req.headers['x-refresh-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }

  return null;
};

/**
 * Validates a token against Supabase Auth (GoTrue)
 */
export const validateSupabaseToken = async (
  token: string
): Promise<{ user: SafeUser; session: SafeSession } | null> => {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data || !data.user) {
      return null;
    }

    const u = data.user;
    const safeUser: SafeUser = {
      id: u.id,
      email: u.email || '',
      name: (u.user_metadata?.name as string) || (u.email ? u.email.split('@')[0] : 'User'),
      createdAt: u.created_at ? Date.parse(u.created_at) : Date.now(),
      updatedAt: u.updated_at ? Date.parse(u.updated_at) : Date.now(),
    };

    const safeSession: SafeSession = {
      id: token,
      userId: u.id,
      expiresAt: Date.now() + 3600 * 1000,
      createdAt: Date.now(),
    };

    return { user: safeUser, session: safeSession };
  } catch {
    return null;
  }
};

/**
 * Middleware that strictly enforces authentication (supports both SQLite and Supabase)
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractSessionId(req);

  if (!token) {
    res.status(401).json({
      error: {
        message: 'Authentication required. Please log in to continue.',
        code: 'UNAUTHORIZED',
        status: 401,
      },
    });
    return;
  }

  // 1. If Supabase mode is active or token is a 3-part JWT, attempt Supabase validation
  if (config.databaseDriver === 'supabase' || (token.includes('.') && token.split('.').length === 3)) {
    const sbResult = await validateSupabaseToken(token);
    if (sbResult) {
      req.user = sbResult.user;
      req.session = sbResult.session;
      next();
      return;
    }
  }

  // 2. Validate against SQLite sessions table
  const sqliteResult = authService.validateSession(token);
  if (sqliteResult) {
    req.user = sqliteResult.user;
    req.session = sqliteResult.session;
    next();
    return;
  }

  // Clear stale cookie if session is invalid or expired
  clearSessionCookie(res);
  res.status(401).json({
    error: {
      message: 'Your session has expired or is invalid. Please log in again.',
      code: 'SESSION_EXPIRED',
      status: 401,
    },
  });
};

/**
 * Middleware that optionally attaches authenticated user if session is present
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = extractSessionId(req);

  if (token) {
    if (config.databaseDriver === 'supabase' || (token.includes('.') && token.split('.').length === 3)) {
      const sbResult = await validateSupabaseToken(token);
      if (sbResult) {
        req.user = sbResult.user;
        req.session = sbResult.session;
        next();
        return;
      }
    }

    const sqliteResult = authService.validateSession(token);
    if (sqliteResult) {
      req.user = sqliteResult.user;
      req.session = sqliteResult.session;
    }
  }

  next();
};
