import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { standardRateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { modelsRouter } from './routes/models.js';
import { chatRouter } from './routes/chat.js';

export const createApp = (): Express => {
  const app = express();

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Managed by reverse proxy or frontend CSP
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (config.allowedOrigins.includes(origin) || config.nodeEnv === 'development') {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked request from origin: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    })
  );

  // Standard request limit & parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Global rate limiter
  app.use(standardRateLimiter);

  // Mount API routes
  app.use('/api/health', healthRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/chat', chatRouter);

  // 404 Catch-all handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: {
        message: `Endpoint ${req.method} ${req.originalUrl} not found`,
        code: 'NOT_FOUND',
        status: 404,
      },
    });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
};
