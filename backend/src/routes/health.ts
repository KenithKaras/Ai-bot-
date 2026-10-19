import { Router, type Request, type Response } from 'express';
import { aiProviderService } from '../services/aiProvider.js';

export const healthRouter = Router();

/**
 * GET /api/health
 * Returns server health and provider readiness
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    providerConfigured: aiProviderService.isConfigured(),
  });
});

/**
 * GET /api/health/provider
 * Proactively verifies provider gateway connectivity and measures latency
 */
healthRouter.get('/provider', async (_req: Request, res: Response) => {
  if (!aiProviderService.isConfigured()) {
    res.status(503).json({
      status: 'error',
      message: 'RADOX_API_KEY is not configured on the server.',
      providerConfigured: false,
    });
    return;
  }

  try {
    const result = await aiProviderService.testConnection();
    res.json({
      status: 'ok',
      providerConfigured: true,
      latencyMs: result.latencyMs,
      modelCount: result.modelCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(502).json({
      status: 'error',
      providerConfigured: true,
      message: error.message || 'Failed to connect to Radox AI provider.',
    });
  }
});
