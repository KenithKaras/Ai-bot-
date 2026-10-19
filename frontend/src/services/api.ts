import type { Model } from '../types/index.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface HealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
  providerConfigured: boolean;
}

export interface ProviderTestResponse {
  status: 'ok' | 'error';
  latencyMs?: number;
  modelCount?: number;
  message?: string;
  providerConfigured: boolean;
}

export interface StreamEventCallbacks {
  onInit?: (data: { requestId: string; model: string }) => void;
  onChunk: (content: string, reasoningContent?: string) => void;
  onDone: (finishReason?: string) => void;
  onError: (error: Error) => void;
}

export const apiService = {
  /**
   * Check backend health
   */
  async getHealth(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE}/api/health`);
    if (!res.ok) {
      throw new Error(`Health check failed with status ${res.status}`);
    }
    return res.json();
  },

  /**
   * Test Radox AI provider connectivity
   */
  async testProvider(): Promise<ProviderTestResponse> {
    const res = await fetch(`${API_BASE}/api/health/provider`);
    return res.json();
  },

  /**
   * Retrieve available models dynamically
   */
  async getModels(): Promise<Model[]> {
    const res = await fetch(`${API_BASE}/api/models`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to fetch models: HTTP ${res.status}`);
    }
    const json = await res.json();
    return json.data || [];
  },

  /**
   * Non-streaming chat completion
   */
  async sendChatMessage(params: {
    model: string;
    messages: { role: string; content: string }[];
    temperature?: number;
    max_tokens?: number;
    requestId?: string;
  }) {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Chat request failed: HTTP ${res.status}`);
    }

    return res.json();
  },

  /**
   * Token-by-token streaming response via Server-Sent Events (SSE)
   */
  async streamChatMessage(
    params: {
      model: string;
      messages: { role: string; content: string }[];
      temperature?: number;
      max_tokens?: number;
      requestId: string;
    },
    callbacks: StreamEventCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(params),
        signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Streaming request failed: HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream not supported by this browser.');
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = 'message';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            try {
              const parsed = JSON.parse(dataStr);

              if (currentEvent === 'init') {
                callbacks.onInit?.(parsed);
              } else if (currentEvent === 'chunk') {
                callbacks.onChunk(parsed.content || '', parsed.reasoningContent);
              } else if (currentEvent === 'done') {
                callbacks.onDone(parsed.finishReason);
                return;
              } else if (currentEvent === 'error') {
                callbacks.onError(new Error(parsed.message || 'Stream generation failed'));
                return;
              }
            } catch {
              // Ignore partial JSON parse errors
            }
          }
        }
      }

      callbacks.onDone();
    } catch (error: any) {
      if (signal?.aborted || error.name === 'AbortError') {
        callbacks.onDone('cancelled');
        return;
      }
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  },

  /**
   * Cancel an active streaming request on the backend
   */
  async cancelStream(requestId: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/chat/stream/${encodeURIComponent(requestId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (e) {
      console.warn('Failed to notify backend of stream cancellation', e);
      return false;
    }
  },
};
