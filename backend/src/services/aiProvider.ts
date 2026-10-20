import OpenAI from 'openai';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { config, isApiKeyConfigured } from '../config.js';
import type { ChatMessage } from '../schemas/chatSchema.js';

export interface NormalizedModel {
  id: string;
  name: string;
  ownedBy: string;
  created: number;
  isClaude: boolean;
  capabilities: {
    streaming: boolean;
    vision: boolean;
    reasoning: boolean;
  };
}

export interface StreamCallbacks {
  onInit?: (data: { ttftMs?: number }) => void;
  onChunk: (chunk: { content?: string; reasoningContent?: string }) => void;
  onDone: (finishReason?: string, metrics?: { ttftMs?: number; totalTimeMs?: number }) => void;
  onError: (error: Error) => void;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
}

// Global HTTP Keep-Alive agents for high-throughput connection pooling
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 60, timeout: 60000 });

export class AIProviderService {
  private clientCache: Map<string, OpenAI> = new Map();
  private activeStreams: Map<string, AbortController> = new Map();

  constructor() {
    this.initDefaultClient();
  }

  /**
   * Initializes or refreshes the default global server client
   */
  public initDefaultClient(): void {
    if (isApiKeyConfigured()) {
      this.getOrCreateClient({
        baseUrl: config.radoxBaseUrl,
        apiKey: config.radoxApiKey,
      });
    }
  }

  public isConfigured(): boolean {
    return isApiKeyConfigured();
  }

  /**
   * Retrieves or instantiates a cached OpenAI client instance with HTTP connection pooling
   */
  public getOrCreateClient(providerConfig?: ProviderConfig): OpenAI {
    const baseUrl = providerConfig?.baseUrl || config.radoxBaseUrl;
    const apiKey = providerConfig?.apiKey || config.radoxApiKey;

    if (!apiKey) {
      throw new Error(
        'No AI Provider API key configured. Please configure an API Gateway in Settings or configure RADOX_API_KEY in backend/.env'
      );
    }

    const cacheKey = crypto
      .createHash('sha256')
      .update(`${baseUrl}::${apiKey}`)
      .digest('hex');

    let client = this.clientCache.get(cacheKey);
    if (!client) {
      client = new OpenAI({
        apiKey,
        baseURL: baseUrl,
        timeout: config.requestTimeoutMs,
        maxRetries: 1,
        httpAgent: httpsAgent,
      });
      this.clientCache.set(cacheKey, client);
    }

    return client;
  }

  /**
   * Fetches models from the gateway and normalizes them
   */
  public async listModels(providerConfig?: ProviderConfig): Promise<NormalizedModel[]> {
    const client = this.getOrCreateClient(providerConfig);

    try {
      const response = await client.models.list();
      const modelsList = response.data || [];

      const normalized: NormalizedModel[] = modelsList.map((model) => {
        const idLower = model.id.toLowerCase();
        const isClaude = idLower.includes('claude');
        const isReasoning =
          idLower.includes('reasoner') ||
          idLower.includes('reasoning') ||
          idLower.includes('deepseek-r') ||
          idLower.includes('o1') ||
          idLower.includes('o3') ||
          idLower.includes('opus');
        const isVision =
          idLower.includes('vision') ||
          idLower.includes('4o') ||
          idLower.includes('claude-3') ||
          idLower.includes('gemini');

        const displayName = model.id
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        return {
          id: model.id,
          name: displayName,
          ownedBy: model.owned_by || 'ai-gateway',
          created: model.created || Math.floor(Date.now() / 1000),
          isClaude,
          capabilities: {
            streaming: true,
            vision: isVision,
            reasoning: isReasoning,
          },
        };
      });

      return normalized.sort((a, b) => {
        if (a.isClaude && !b.isClaude) return -1;
        if (!a.isClaude && b.isClaude) return 1;
        return a.id.localeCompare(b.id);
      });
    } catch (error: any) {
      throw this.sanitizeError(error, 'Failed to fetch models from provider');
    }
  }

  /**
   * Performs standard non-streaming chat completion
   */
  public async createChatCompletion(params: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    requestId?: string;
    providerConfig?: ProviderConfig;
  }) {
    const client = this.getOrCreateClient(params.providerConfig);
    const controller = new AbortController();

    if (params.requestId) {
      this.activeStreams.set(params.requestId, controller);
    }

    try {
      const response = await client.chat.completions.create(
        {
          model: params.model,
          messages: params.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: params.temperature ?? 0.7,
          max_tokens: params.max_tokens,
          stream: false,
        },
        { signal: controller.signal }
      );

      return response;
    } catch (error: any) {
      if (controller.signal.aborted) {
        throw new Error('Chat completion was cancelled by the user.');
      }
      throw this.sanitizeError(error, 'Chat completion request failed');
    } finally {
      if (params.requestId) {
        this.activeStreams.delete(params.requestId);
      }
    }
  }

  /**
   * Streams chat completion token-by-token with TTFT latency tracking
   */
  public async streamChatCompletion(
    params: {
      model: string;
      messages: ChatMessage[];
      temperature?: number;
      max_tokens?: number;
      requestId: string;
      providerConfig?: ProviderConfig;
    },
    callbacks: StreamCallbacks
  ): Promise<void> {
    const client = this.getOrCreateClient(params.providerConfig);
    const controller = new AbortController();
    this.activeStreams.set(params.requestId, controller);

    const startTime = Date.now();
    let ttftMs: number | undefined = undefined;

    try {
      const stream = await client.chat.completions.create(
        {
          model: params.model,
          messages: params.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: params.temperature ?? 0.7,
          max_tokens: params.max_tokens,
          stream: true,
        },
        { signal: controller.signal }
      );

      let lastFinishReason: string | undefined = undefined;

      for await (const chunk of stream) {
        if (controller.signal.aborted) {
          callbacks.onDone('cancelled');
          return;
        }

        if (ttftMs === undefined) {
          ttftMs = Date.now() - startTime;
          callbacks.onInit?.({ ttftMs });
        }

        const choice = chunk.choices?.[0];
        const content = choice?.delta?.content || '';
        const reasoningContent = (choice?.delta as any)?.reasoning_content || undefined;

        if (content || reasoningContent) {
          callbacks.onChunk({ content, reasoningContent });
        }

        if (choice?.finish_reason) {
          lastFinishReason = choice.finish_reason;
        }
      }

      const totalTimeMs = Date.now() - startTime;
      callbacks.onDone(lastFinishReason || 'stop', { ttftMs, totalTimeMs });
    } catch (error: any) {
      if (controller.signal.aborted) {
        callbacks.onDone('cancelled');
        return;
      }
      const safeError = this.sanitizeError(error, 'Stream generation failed');
      callbacks.onError(safeError);
    } finally {
      this.activeStreams.delete(params.requestId);
    }
  }

  /**
   * Cancels an ongoing generation
   */
  public cancelRequest(requestId: string): boolean {
    const controller = this.activeStreams.get(requestId);
    if (controller) {
      controller.abort();
      this.activeStreams.delete(requestId);
      return true;
    }
    return false;
  }

  /**
   * Test provider connection and measure latency
   */
  public async testConnection(providerConfig?: ProviderConfig): Promise<{ latencyMs: number; modelCount: number }> {
    const start = Date.now();
    const models = await this.listModels(providerConfig);
    const latencyMs = Date.now() - start;
    return { latencyMs, modelCount: models.length };
  }

  /**
   * Sanitizes provider errors to ensure no internal tokens, URLs, or traces leak
   */
  public sanitizeError(error: any, fallbackMessage: string): Error {
    const status = error?.status || error?.statusCode;
    const rawMsg = error?.message || '';

    if (status === 401 || rawMsg.includes('401') || rawMsg.toLowerCase().includes('api key')) {
      return new Error('Invalid or unauthorized API key for the selected AI provider.');
    }
    if (status === 429 || rawMsg.includes('429') || rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('credit')) {
      return new Error('Rate limit or balance quota exceeded on the AI provider.');
    }
    if (status === 404 || rawMsg.includes('404')) {
      return new Error('The requested model was not found on the AI provider or is temporarily unavailable.');
    }
    if (status === 502 || status === 503 || status === 504) {
      return new Error('AI provider gateway is temporarily unavailable. Please retry shortly.');
    }
    if (rawMsg.includes('ETIMEDOUT') || rawMsg.includes('timeout')) {
      return new Error('Request to AI provider timed out. Upstream server took too long to respond.');
    }
    if (rawMsg.includes('ECONNREFUSED') || rawMsg.includes('ENOTFOUND')) {
      return new Error('Unable to reach AI provider gateway. Please verify network connectivity and Base URL.');
    }

    const cleanMsg = rawMsg
      .replace(/cc_[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]')
      .replace(/sk-[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]')
      .replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, 'Bearer [REDACTED]')
      .trim();

    return new Error(cleanMsg || fallbackMessage);
  }
}

export const aiProviderService = new AIProviderService();
