import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { config } from './config.js';
import { standardRateLimiter } from './middleware/rateLimiter.js';
import { optionalAuth } from './middleware/authMiddleware.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { modelsRouter } from './routes/models.js';
import { chatRouter } from './routes/chat.js';
import { authRouter } from './routes/auth.js';
import { providersRouter } from './routes/providers.js';

export const createApp = (): Express => {
  const app = express();

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
    })
  );

  // CORS configuration - allow all origins so cloud deployments (Render, Vercel, etc.) and local environments work seamlessly
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // Standard request limit & parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Global rate limiter for API endpoints (do not rate limit static assets)
  app.use('/api', standardRateLimiter);

  // Attach authenticated user to req.user if session present
  app.use('/api', optionalAuth);

  // Mount API routes
  app.use('/api/auth', authRouter);
  app.use('/api/providers', providersRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/chat', chatRouter);

  // Serve Frontend Static Build if available (enables single-service all-in-one deployment)
  const distCandidates = [
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(__dirname, '../frontend/dist'),
  ];
  const staticDist = distCandidates.find((d) => fs.existsSync(d));

  if (staticDist) {
    app.use(express.static(staticDist));
    app.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/api')) return next();
      // Don't return index.html for static assets that failed to load
      if (/\.[a-zA-Z0-9]+$/.test(req.path)) {
        return res.status(404).send('Asset not found');
      }
      res.sendFile(path.join(staticDist, 'index.html'));
    });
  } else {
    // 404 Catch-all handler when running API standalone
    app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: {
          message: `Endpoint ${req.method} ${req.originalUrl} not found`,
          code: 'NOT_FOUND',
          status: 404,
        },
      });
    });
  }

  // Global error handler
  app.use(errorHandler);

  return app;
};
