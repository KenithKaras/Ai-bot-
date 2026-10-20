import type {
  Model,
  User,
  AuthSession,
  SafeProvider,
  ProviderCreateInput,
  ProviderUpdateInput,
} from '../types/index.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

let storedAuthToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('radox_auth_token') : null;
let storedRefreshToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('radox_refresh_token') : null;

export const setAuthToken = (token: string | null, refreshToken?: string | null): void => {
  storedAuthToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('radox_auth_token', token);
    } else {
      localStorage.removeItem('radox_auth_token');
    }

    if (refreshToken !== undefined) {
      storedRefreshToken = refreshToken;
      if (refreshToken) {
        localStorage.setItem('radox_refresh_token', refreshToken);
      } else {
        localStorage.removeItem('radox_refresh_token');
      }
    }
  }
};

export const getAuthToken = (): string | null => storedAuthToken;
export const getRefreshToken = (): string | null => storedRefreshToken;

let inflightRefresh: Promise<boolean> | null = null;

export const refreshSessionDeduplicated = async (): Promise<boolean> => {
  if (inflightRefresh) {
    return inflightRefresh;
  }

  inflightRefresh = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!res.ok) {
        setAuthToken(null, null);
        return false;
      }

      const json = await res.json();
      if (json.session?.id) {
        setAuthToken(json.session.id, json.session.refreshToken || storedRefreshToken);
        return true;
      }

      setAuthToken(null, null);
      return false;
    } catch {
      return false;
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
};

const getAuthHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const headers: Record<string, string> = { ...extra };
  if (storedAuthToken) {
    headers['Authorization'] = `Bearer ${storedAuthToken}`;
  }
  return headers;
};

export interface HealthResponse {
  status: string;
  uptime: number;
  timestamp: string;
  providerConfigured: boolean;
}

export interface AuthResponse {
  user: User;
  session: AuthSession;
}

export interface ProviderTestResponse {
  status: 'ok' | 'error';
  latencyMs?: number;
  modelCount?: number;
  message?: string;
}

export interface StreamEventCallbacks {
  onInit?: (data: { requestId: string; model: string }) => void;
  onTiming?: (ttftMs: number) => void;
  onChunk: (content: string, reasoningContent?: string) => void;
  onDone: (finishReason?: string, metrics?: { ttftMs?: number; totalTimeMs?: number }) => void;
  onError: (error: Error) => void;
}

export const apiService = {
  /**
   * Register a new user
   */
  async register(params: {
    email: string;
    password: string;
    name: string;
    confirmPassword?: string;
  }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Registration failed (HTTP ${res.status})`);
    }

    const json = await res.json();
    if (json.session?.id) {
      setAuthToken(json.session.id, json.session.refreshToken || null);
    }
    return json;
  },

  /**
   * Log in user with credentials
   */
  async login(params: { email: string; password: string }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Login failed (HTTP ${res.status})`);
    }

    const json = await res.json();
    if (json.session?.id) {
      setAuthToken(json.session.id, json.session.refreshToken || null);
    }
    return json;
  },

  /**
   * Refresh current authentication session
   */
  async refreshSession(): Promise<boolean> {
    return refreshSessionDeduplicated();
  },

  /**
   * Log out user and destroy server session
   */
  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });
    } catch (e) {
      console.warn('Logout network error', e);
    } finally {
      setAuthToken(null, null);
    }
  },

  /**
   * Fetch current authenticated user session
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      let res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      // Silent auto-refresh if 401 and refresh token available
      if (res.status === 401 && (storedRefreshToken || storedAuthToken)) {
        const refreshed = await refreshSessionDeduplicated();
        if (refreshed) {
          res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: getAuthHeaders(),
            credentials: 'include',
          });
        }
      }

      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      return data.user || null;
    } catch {
      return null;
    }
  },

  /**
   * Check backend health
   */
  async getHealth(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE}/api/health`, {
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error(`Health check failed with status ${res.status}`);
    }
    return res.json();
  },

  /**
   * Test Radox AI provider connectivity
   */
  async testProvider(): Promise<ProviderTestResponse> {
    const res = await fetch(`${API_BASE}/api/health/provider`, {
      credentials: 'include',
    });
    return res.json();
  },

  /**
   * Fetch user's configured providers
   */
  async getProviders(): Promise<SafeProvider[]> {
    const res = await fetch(`${API_BASE}/api/providers`, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to fetch providers (HTTP ${res.status})`);
    }
    const json = await res.json();
    return json.data || [];
  },

  /**
   * Create a new custom AI gateway provider
   */
  async createProvider(input: ProviderCreateInput): Promise<SafeProvider> {
    const res = await fetch(`${API_BASE}/api/providers`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to create provider (HTTP ${res.status})`);
    }
    const json = await res.json();
    return json.data;
  },

  /**
   * Update an existing provider
   */
  async updateProvider(id: string, input: ProviderUpdateInput): Promise<SafeProvider> {
    const res = await fetch(`${API_BASE}/api/providers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to update provider (HTTP ${res.status})`);
    }
    const json = await res.json();
    return json.data;
  },

  /**
   * Delete a provider
   */
  async deleteProvider(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/providers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to delete provider (HTTP ${res.status})`);
    }
  },

  /**
   * Set a provider as default
   */
  async setDefaultProvider(id: string): Promise<SafeProvider> {
    const res = await fetch(`${API_BASE}/api/providers/${encodeURIComponent(id)}/default`, {
      method: 'POST',
      headers: getAuthHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to set default provider (HTTP ${res.status})`);
    }
    const json = await res.json();
    return json.data;
  },

  /**
   * Test connection to a custom provider (saved or unsaved)
   */
  async testCustomProvider(params: {
    providerId?: string;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<ProviderTestResponse> {
    const res = await fetch(`${API_BASE}/api/providers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
    });
    return res.json();
  },

  /**
   * Discover models from a custom provider (saved or unsaved)
   */
  async discoverCustomModels(params: {
    providerId?: string;
    baseUrl?: string;
    apiKey?: string;
  }): Promise<Model[]> {
    const res = await fetch(`${API_BASE}/api/providers/models`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to discover models (HTTP ${res.status})`);
    }
    const json = await res.json();
    return json.data || [];
  },

  /**
   * Retrieve available models dynamically (optionally scoped to a provider)
   */
  async getModels(providerId?: string): Promise<Model[]> {
    const url = providerId
      ? `${API_BASE}/api/models?providerId=${encodeURIComponent(providerId)}`
      : `${API_BASE}/api/models`;

    const res = await fetch(url, {
      headers: getAuthHeaders(),
      credentials: 'include',
    });
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
    providerId?: string;
  }) {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      credentials: 'include',
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
      providerId?: string;
    },
    callbacks: StreamEventCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: 'POST',
        headers: getAuthHeaders({
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        }),
        credentials: 'include',
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
              } else if (currentEvent === 'timing') {
                if (typeof parsed.ttftMs === 'number') {
                  callbacks.onTiming?.(parsed.ttftMs);
                }
              } else if (currentEvent === 'chunk') {
                callbacks.onChunk(parsed.content || '', parsed.reasoningContent);
              } else if (currentEvent === 'done') {
                callbacks.onDone(parsed.finishReason, {
                  ttftMs: parsed.ttftMs,
                  totalTimeMs: parsed.totalTimeMs,
                });
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
