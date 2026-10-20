import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import { aiProviderService, type ProviderConfig } from '../services/aiProvider.js';
import { providerService } from '../services/providerService.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { validateBody, validateParams } from '../middleware/requestValidator.js';
import { ChatRequestSchema, CancelRequestSchema, type ChatRequest } from '../schemas/chatSchema.js';
import { chatRateLimiter } from '../middleware/rateLimiter.js';

export const chatRouter = Router();

// Enforce mandatory authentication for all chat actions (no guest access)
chatRouter.use(requireAuth);

// Apply chat rate limiter to all chat routes
chatRouter.use(chatRateLimiter);

/**
 * Resolves the provider credentials for the request (user custom provider or server default)
 */
const resolveProviderConfig = (req: Request, providerId?: string): ProviderConfig | undefined => {
  if (req.user) {
    if (providerId) {
      const dec = providerService.getDecryptedProvider(req.user.id, providerId);
      if (dec) {
        return { baseUrl: dec.baseUrl, apiKey: dec.apiKey };
      }
    }
    const def = providerService.getDefaultDecryptedProvider(req.user.id);
    if (def) {
      return { baseUrl: def.baseUrl, apiKey: def.apiKey };
    }
  }
  return undefined;
};

/**
 * POST /api/chat
 * Non-streaming chat completion
 */
chatRouter.post(
  '/',
  validateBody(ChatRequestSchema),
  async (req: Request<{}, {}, ChatRequest>, res: Response, next: NextFunction) => {
    try {
      const { model, messages, temperature, max_tokens, requestId, providerId } = req.body;
      const effectiveRequestId = requestId || crypto.randomUUID();
      const providerConfig = resolveProviderConfig(req, providerId);

      const completion = await aiProviderService.createChatCompletion({
        model,
        messages,
        temperature,
        max_tokens,
        requestId: effectiveRequestId,
        providerConfig,
      });

      res.json(completion);
    } catch (error: any) {
      next(error);
    }
  }
);

/**
 * POST /api/chat/stream
 * Real token-by-token streaming response via Server-Sent Events (SSE)
 */
chatRouter.post(
  '/stream',
  validateBody(ChatRequestSchema),
  async (req: Request<{}, {}, ChatRequest>, res: Response, _next: NextFunction) => {
    const { model, messages, temperature, max_tokens, requestId, providerId } = req.body;
    const effectiveRequestId = requestId || crypto.randomUUID();
    const providerConfig = resolveProviderConfig(req, providerId);

    // Disable TCP delay for real-time token delivery
    req.socket.setNoDelay(true);

    // Prepare SSE response headers (with Nginx buffering disabled)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Content-Encoding', 'none');
    res.setHeader('X-Accel-Buffering', 'no'); // Essential for Nginx reverse proxies

    // Flush headers if supported
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    // Handle client disconnect gracefully
    req.on('close', () => {
      aiProviderService.cancelRequest(effectiveRequestId);
    });

    // Send initial handshake event
    res.write(
      `event: init\ndata: ${JSON.stringify({
        requestId: effectiveRequestId,
        model,
      })}\n\n`
    );
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }

    try {
      await aiProviderService.streamChatCompletion(
        {
          model,
          messages,
          temperature,
          max_tokens,
          requestId: effectiveRequestId,
          providerConfig,
        },
        {
          onInit: (initData) => {
            if (!res.writableEnded && initData.ttftMs !== undefined) {
              res.write(
                `event: timing\ndata: ${JSON.stringify({
                  ttftMs: initData.ttftMs,
                })}\n\n`
              );
              if (typeof (res as any).flush === 'function') {
                (res as any).flush();
              }
            }
          },
          onChunk: (chunk) => {
            if (!res.writableEnded) {
              res.write(`event: chunk\ndata: ${JSON.stringify(chunk)}\n\n`);
              if (typeof (res as any).flush === 'function') {
                (res as any).flush();
              }
            }
          },
          onDone: (finishReason, metrics) => {
            if (!res.writableEnded) {
              res.write(
                `event: done\ndata: ${JSON.stringify({
                  finishReason: finishReason || 'stop',
                  ttftMs: metrics?.ttftMs,
                  totalTimeMs: metrics?.totalTimeMs,
                })}\n\n`
              );
              res.end();
            }
          },
          onError: (error) => {
            if (!res.writableEnded) {
              res.write(
                `event: error\ndata: ${JSON.stringify({
                  message: error.message || 'Stream generation failed',
                })}\n\n`
              );
              res.end();
            }
          },
        }
      );
    } catch (error: any) {
      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            message: error.message || 'Stream processing failed',
          })}\n\n`
        );
        res.end();
      }
    }
  }
);

/**
 * DELETE /api/chat/stream/:requestId
 * Cancels an active streaming or completion generation
 */
chatRouter.delete(
  '/stream/:requestId',
  validateParams(CancelRequestSchema),
  (req: Request<{ requestId: string }>, res: Response) => {
    const { requestId } = req.params;
    const cancelled = aiProviderService.cancelRequest(requestId);

    res.json({
      success: true,
      cancelled,
      message: cancelled
        ? `Request ${requestId} successfully cancelled.`
        : `Request ${requestId} was not found or already completed.`,
    });
  }
);
