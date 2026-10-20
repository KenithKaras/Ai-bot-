import { Router, type Request, type Response, type NextFunction } from 'express';
import { aiProviderService, type ProviderConfig } from '../services/aiProvider.js';
import { providerService } from '../services/providerService.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export const modelsRouter = Router();

// Enforce mandatory authentication for model discovery
modelsRouter.use(requireAuth);

/**
 * GET /api/models
 * Dynamically retrieves and normalizes available models from active provider
 */
modelsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    let providerConfig: ProviderConfig | undefined = undefined;
    const userId = req.user!.id;

    const providerId = req.query.providerId as string | undefined;
    if (providerId) {
      const dec = providerService.getDecryptedProvider(userId, providerId);
      if (dec) {
        providerConfig = { baseUrl: dec.baseUrl, apiKey: dec.apiKey };
      }
    } else {
      const def = providerService.getDefaultDecryptedProvider(userId);
      if (def) {
        providerConfig = { baseUrl: def.baseUrl, apiKey: def.apiKey };
      }
    }

    const models = await aiProviderService.listModels(providerConfig);
    res.json({
      data: models,
      count: models.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    next(error);
  }
});
