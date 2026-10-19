import { Router, type Request, type Response, type NextFunction } from 'express';
import { aiProviderService } from '../services/aiProvider.js';

export const modelsRouter = Router();

/**
 * GET /api/models
 * Dynamically retrieves and normalizes available models from Radox AI
 */
modelsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const models = await aiProviderService.listModels();
    res.json({
      data: models,
      count: models.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    next(error);
  }
});
