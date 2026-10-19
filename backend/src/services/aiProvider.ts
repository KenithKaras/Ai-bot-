import OpenAI from 'openai';
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
  onChunk: (chunk: { content?: string; reasoningContent?: string }) => void;
  onDone: (finishReason?: string) => void;
  onError: (error: Error) => void;
}

export class AIProviderService {
  private client: OpenAI | null = null;
  private activeStreams: Map<string, AbortController> = new Map();

  constructor() {
    this.initClient();
  }

  /**
   * Initialize or reinitialize the OpenAI SDK client
   */
  public initClient(): void {
    if (isApiKeyConfigured()) {
      this.client = new OpenAI({
        apiKey: config.radoxApiKey,
        baseURL: config.radoxBaseUrl,
        timeout: config.requestTimeoutMs,
        maxRetries: 1, // Keep retries bounded to prevent unexpected token charges
      });
    } else {
      this.client = null;
    }
  }

  public isConfigured(): boolean {
    return isApiKeyConfigured();
  }

  private getClient(): OpenAI {
    if (!this.client) {
      if (isApiKeyConfigured()) {
        this.initClient();
      }
    }
    if (!this.client) {
      throw new Error(
        'RADOX_API_KEY is not configured on the backend server. Please set RADOX_API_KEY in backend/.env'
      );
    }
    return this.client;
  }

  /**
   * Fetches models from Radox AI and normalizes them
   */
  public async listModels(): Promise<NormalizedModel[]> {
    const client = this.getClient();

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
          idLower.includes('o3');
        const isVision =
          idLower.includes('vision') ||
          idLower.includes('4o') ||
          idLower.includes('claude-3') ||
          idLower.includes('gemini');

        // Clean display name
        const displayName = model.id
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        return {
          id: model.id,
          name: displayName,
          ownedBy: model.owned_by || 'radox',
          created: model.created || Math.floor(Date.now() / 1000),
          isClaude,
          capabilities: {
            streaming: true, // Radox AI gateway supports streaming across modern chat models
            vision: isVision,
            reasoning: isReasoning,
          },
        };
      });

      // Sort models: Claude models first, then alphabetical by id
      return normalized.sort((a, b) => {
        if (a.isClaude && !b.isClaude) return -1;
        if (!a.isClaude && b.isClaude) return 1;
        return a.id.localeCompare(b.id);
      });
    } catch (error: any) {
      throw this.sanitizeError(error, 'Failed to fetch models from Radox AI');
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
  }) {
    const client = this.getClient();
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
   * Streams chat completion token-by-token using SSE
   */
  public async streamChatCompletion(
    params: {
      model: string;
      messages: ChatMessage[];
      temperature?: number;
      max_tokens?: number;
      requestId: string;
    },
    callbacks: StreamCallbacks
  ): Promise<void> {
    const client = this.getClient();
    const controller = new AbortController();
    this.activeStreams.set(params.requestId, controller);

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

      // Complete stream after all chunks have been received
      callbacks.onDone(lastFinishReason || 'stop');
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
   * Test provider connection
   */
  public async testConnection(): Promise<{ latencyMs: number; modelCount: number }> {
    const start = Date.now();
    const models = await this.listModels();
    const latencyMs = Date.now() - start;
    return { latencyMs, modelCount: models.length };
  }

  /**
   * Sanitizes provider errors to ensure no internal tokens, URLs, or traces leak
   */
  public sanitizeError(error: any, fallbackMessage: string): Error {
    const status = error?.status || error?.statusCode;
    const rawMsg = error?.message || '';

    // Check specific OpenAI/Radox error cases
    if (status === 401 || rawMsg.includes('401') || rawMsg.toLowerCase().includes('api key')) {
      return new Error('Invalid or unauthorized Radox AI API key. Please check your credentials.');
    }
    if (status === 429 || rawMsg.includes('429') || rawMsg.toLowerCase().includes('quota') || rawMsg.toLowerCase().includes('credit')) {
      return new Error('Radox AI rate limit or balance quota exceeded. Please check your account credits.');
    }
    if (status === 404 || rawMsg.includes('404')) {
      return new Error('The requested model was not found on Radox AI or is temporarily unavailable.');
    }
    if (status === 502 || status === 503 || status === 504) {
      return new Error('Radox AI gateway service is temporarily unavailable. Please retry shortly.');
    }
    if (rawMsg.includes('ETIMEDOUT') || rawMsg.includes('timeout')) {
      return new Error('Request to Radox AI timed out. Upstream server took too long to respond.');
    }
    if (rawMsg.includes('ECONNREFUSED') || rawMsg.includes('ENOTFOUND')) {
      return new Error('Unable to reach Radox AI gateway. Please verify network connectivity.');
    }

    // Strip sensitive parameters or patterns
    const cleanMsg = rawMsg
      .replace(/cc_[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]')
      .replace(/Bearer\s+[a-zA-Z0-9_\-.]+/gi, 'Bearer [REDACTED]')
      .trim();

    return new Error(cleanMsg || fallbackMessage);
  }
}

export const aiProviderService = new AIProviderService();
