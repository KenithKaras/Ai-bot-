import { Router, type Request, type Response, type NextFunction } from 'express';
import { providerService, ProviderServiceError } from '../services/providerService.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { SSRFError } from '../utils/ssrfValidator.js';

export const providersRouter = Router();

// Protect all provider routes with requireAuth
providersRouter.use(requireAuth);

/**
 * List all providers for authenticated user
 * GET /api/providers
 */
providersRouter.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const providers = providerService.listProviders(userId);
  res.json({ data: providers });
});

/**
 * Create a new provider
 * POST /api/providers
 */
providersRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { name, baseUrl, apiKey, defaultModel, isDefault } = req.body || {};

    const created = providerService.createProvider(userId, {
      name,
      baseUrl,
      apiKey,
      defaultModel,
      isDefault: Boolean(isDefault),
    });

    res.status(201).json({ data: created });
  } catch (err: any) {
    if (err instanceof ProviderServiceError || err instanceof SSRFError) {
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
});

/**
 * Update an existing provider
 * PUT /api/providers/:id
 */
providersRouter.put('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const providerId = req.params.id;
    const { name, baseUrl, apiKey, defaultModel, isDefault } = req.body || {};

    const updated = providerService.updateProvider(userId, providerId, {
      name,
      baseUrl,
      apiKey,
      defaultModel,
      isDefault: isDefault !== undefined ? Boolean(isDefault) : undefined,
    });

    res.json({ data: updated });
  } catch (err: any) {
    if (err instanceof ProviderServiceError || err instanceof SSRFError) {
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
});

/**
 * Delete a provider
 * DELETE /api/providers/:id
 */
providersRouter.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const providerId = req.params.id;

    providerService.deleteProvider(userId, providerId);
    res.json({ success: true, message: 'Provider deleted successfully.' });
  } catch (err: any) {
    if (err instanceof ProviderServiceError) {
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
});

/**
 * Set provider as default
 * POST /api/providers/:id/default
 */
providersRouter.post('/:id/default', (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const providerId = req.params.id;

    const updated = providerService.setDefaultProvider(userId, providerId);
    res.json({ data: updated });
  } catch (err: any) {
    if (err instanceof ProviderServiceError) {
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
});

/**
 * Test connectivity and measure latency to a provider
 * POST /api/providers/test
 * Accepts either:
 * - { providerId: string } (for already saved provider)
 * - { baseUrl: string, apiKey: string } (for testing unsaved credentials)
 */
providersRouter.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { providerId, baseUrl, apiKey } = req.body || {};

    let targetBaseUrl = baseUrl;
    let targetApiKey = apiKey;

    if (providerId) {
      const dec = providerService.getDecryptedProvider(userId, providerId);
      if (!dec) {
        res.status(404).json({
          error: {
            message: 'Provider not found.',
            code: 'NOT_FOUND',
            status: 404,
          },
        });
        return;
      }
      targetBaseUrl = dec.baseUrl;
      targetApiKey = dec.apiKey;
    }

    if (!targetBaseUrl || !targetApiKey) {
      res.status(400).json({
        error: {
          message: 'Base URL and API key are required to test connection.',
          code: 'MISSING_FIELDS',
          status: 400,
        },
      });
      return;
    }

    const result = await providerService.testConnection({
      baseUrl: targetBaseUrl,
      apiKey: targetApiKey,
    });

    res.json(result);
  } catch (err: any) {
    if (err instanceof SSRFError) {
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
});

/**
 * Discover models from a provider
 * POST /api/providers/models
 * Accepts either:
 * - { providerId: string }
 * - { baseUrl: string, apiKey: string }
 */
providersRouter.post('/models', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { providerId, baseUrl, apiKey } = req.body || {};

    let targetBaseUrl = baseUrl;
    let targetApiKey = apiKey;

    if (providerId) {
      const dec = providerService.getDecryptedProvider(userId, providerId);
      if (!dec) {
        res.status(404).json({
          error: {
            message: 'Provider not found.',
            code: 'NOT_FOUND',
            status: 404,
          },
        });
        return;
      }
      targetBaseUrl = dec.baseUrl;
      targetApiKey = dec.apiKey;
    }

    if (!targetBaseUrl || !targetApiKey) {
      res.status(400).json({
        error: {
          message: 'Base URL and API key are required to discover models.',
          code: 'MISSING_FIELDS',
          status: 400,
        },
      });
      return;
    }

    const models = await providerService.discoverModels({
      baseUrl: targetBaseUrl,
      apiKey: targetApiKey,
    });

    res.json({ data: models });
  } catch (err: any) {
    if (err instanceof SSRFError) {
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
});
