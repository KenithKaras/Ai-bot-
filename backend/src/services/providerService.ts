import crypto from 'crypto';
import OpenAI from 'openai';
import { getDb } from '../db/database.js';
import { encryptionService } from './encryptionService.js';
import { validateBaseUrl, SSRFError } from '../utils/ssrfValidator.js';
import type { NormalizedModel } from './aiProvider.js';

export interface ProviderRow {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  encrypted_api_key: string;
  key_iv: string;
  key_tag: string;
  key_preview: string;
  default_model: string | null;
  is_default: number;
  created_at: number;
  updated_at: number;
}

export interface SafeProvider {
  id: string;
  name: string;
  baseUrl: string;
  keyPreview: string;
  defaultModel: string | null;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DecryptedProvider extends SafeProvider {
  apiKey: string;
}

export class ProviderServiceError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode = 400, code = 'PROVIDER_ERROR') {
    super(message);
    this.name = 'ProviderServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ProviderService {
  /**
   * List all providers for an authenticated user with masked API keys
   */
  public listProviders(userId: string): SafeProvider[] {
    const db = getDb();
    const rows = db
      .prepare(
        'SELECT * FROM providers WHERE user_id = ? ORDER BY is_default DESC, created_at DESC'
      )
      .all(userId) as ProviderRow[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      baseUrl: r.base_url,
      keyPreview: r.key_preview,
      defaultModel: r.default_model,
      isDefault: Boolean(r.is_default),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Get a single provider with decrypted credentials (server-side use only)
   */
  public getDecryptedProvider(userId: string, providerId: string): DecryptedProvider | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?')
      .get(providerId, userId) as ProviderRow | undefined;

    if (!row) return null;

    try {
      const apiKey = encryptionService.decryptWithLegacyFallback(
        row.encrypted_api_key,
        row.key_iv,
        row.key_tag
      );

      return {
        id: row.id,
        name: row.name,
        baseUrl: row.base_url,
        apiKey,
        keyPreview: row.key_preview,
        defaultModel: row.default_model,
        isDefault: Boolean(row.is_default),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch {
      throw new ProviderServiceError(
        'Failed to decrypt stored credentials for this provider.',
        500,
        'DECRYPTION_FAILED'
      );
    }
  }

  /**
   * Get the default provider for a user (if one exists)
   */
  public getDefaultDecryptedProvider(userId: string): DecryptedProvider | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM providers WHERE user_id = ? AND is_default = 1')
      .get(userId) as ProviderRow | undefined;

    if (!row) return null;
    return this.getDecryptedProvider(userId, row.id);
  }

  /**
   * Create a new provider for a user
   */
  public createProvider(
    userId: string,
    data: {
      name: string;
      baseUrl: string;
      apiKey: string;
      defaultModel?: string;
      isDefault?: boolean;
    }
  ): SafeProvider {
    const db = getDb();
    const name = (data.name || '').trim();
    const rawBaseUrl = (data.baseUrl || '').trim();
    const apiKey = (data.apiKey || '').trim();

    if (!name) {
      throw new ProviderServiceError('Provider name is required.', 400, 'INVALID_NAME');
    }
    if (!apiKey) {
      throw new ProviderServiceError('API key is required.', 400, 'INVALID_API_KEY');
    }

    const normalizedBaseUrl = validateBaseUrl(rawBaseUrl);
    const encrypted = encryptionService.encrypt(apiKey);

    const providerId = crypto.randomUUID();
    const now = Date.now();

    // Check if this is the user's first provider; if so, make it default automatically
    const existingCount = db
      .prepare('SELECT COUNT(*) as count FROM providers WHERE user_id = ?')
      .get(userId) as { count: number };

    const shouldBeDefault = data.isDefault || existingCount.count === 0 ? 1 : 0;

    if (shouldBeDefault) {
      db.prepare('UPDATE providers SET is_default = 0 WHERE user_id = ?').run(userId);
    }

    db.prepare(`
      INSERT INTO providers (
        id, user_id, name, base_url, encrypted_api_key, key_iv, key_tag, key_preview,
        default_model, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      providerId,
      userId,
      name,
      normalizedBaseUrl,
      encrypted.encrypted,
      encrypted.iv,
      encrypted.tag,
      encrypted.preview,
      data.defaultModel || null,
      shouldBeDefault,
      now,
      now
    );

    return {
      id: providerId,
      name,
      baseUrl: normalizedBaseUrl,
      keyPreview: encrypted.preview,
      defaultModel: data.defaultModel || null,
      isDefault: Boolean(shouldBeDefault),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Update an existing provider
   */
  public updateProvider(
    userId: string,
    providerId: string,
    data: {
      name?: string;
      baseUrl?: string;
      apiKey?: string;
      defaultModel?: string;
      isDefault?: boolean;
    }
  ): SafeProvider {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?')
      .get(providerId, userId) as ProviderRow | undefined;

    if (!existing) {
      throw new ProviderServiceError('Provider not found or unauthorized.', 404, 'NOT_FOUND');
    }

    let normalizedBaseUrl = existing.base_url;
    if (data.baseUrl) {
      normalizedBaseUrl = validateBaseUrl(data.baseUrl);
    }

    let encryptedKey = existing.encrypted_api_key;
    let iv = existing.key_iv;
    let tag = existing.key_tag;
    let preview = existing.key_preview;

    if (data.apiKey && data.apiKey.trim()) {
      const enc = encryptionService.encrypt(data.apiKey.trim());
      encryptedKey = enc.encrypted;
      iv = enc.iv;
      tag = enc.tag;
      preview = enc.preview;
    }

    const now = Date.now();
    const name = data.name !== undefined ? data.name.trim() : existing.name;
    const defaultModel =
      data.defaultModel !== undefined ? data.defaultModel : existing.default_model;

    let isDefault = existing.is_default;
    if (data.isDefault !== undefined) {
      isDefault = data.isDefault ? 1 : 0;
      if (isDefault) {
        db.prepare('UPDATE providers SET is_default = 0 WHERE user_id = ?').run(userId);
      }
    }

    db.prepare(`
      UPDATE providers SET
        name = ?,
        base_url = ?,
        encrypted_api_key = ?,
        key_iv = ?,
        key_tag = ?,
        key_preview = ?,
        default_model = ?,
        is_default = ?,
        updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      name,
      normalizedBaseUrl,
      encryptedKey,
      iv,
      tag,
      preview,
      defaultModel,
      isDefault,
      now,
      providerId,
      userId
    );

    return {
      id: providerId,
      name,
      baseUrl: normalizedBaseUrl,
      keyPreview: preview,
      defaultModel,
      isDefault: Boolean(isDefault),
      createdAt: existing.created_at,
      updatedAt: now,
    };
  }

  /**
   * Delete a provider belonging to a user
   */
  public deleteProvider(userId: string, providerId: string): void {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?')
      .get(providerId, userId) as ProviderRow | undefined;

    if (!existing) {
      throw new ProviderServiceError('Provider not found or unauthorized.', 404, 'NOT_FOUND');
    }

    db.prepare('DELETE FROM providers WHERE id = ? AND user_id = ?').run(providerId, userId);

    // If deleted provider was default, make the next one default
    if (existing.is_default) {
      const nextProvider = db
        .prepare('SELECT id FROM providers WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(userId) as { id: string } | undefined;

      if (nextProvider) {
        db.prepare('UPDATE providers SET is_default = 1 WHERE id = ?').run(nextProvider.id);
      }
    }
  }

  /**
   * Set a specific provider as default
   */
  public setDefaultProvider(userId: string, providerId: string): SafeProvider {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM providers WHERE id = ? AND user_id = ?')
      .get(providerId, userId) as ProviderRow | undefined;

    if (!existing) {
      throw new ProviderServiceError('Provider not found or unauthorized.', 404, 'NOT_FOUND');
    }

    db.prepare('UPDATE providers SET is_default = 0 WHERE user_id = ?').run(userId);
    db.prepare('UPDATE providers SET is_default = 1, updated_at = ? WHERE id = ?').run(
      Date.now(),
      providerId
    );

    return {
      id: existing.id,
      name: existing.name,
      baseUrl: existing.base_url,
      keyPreview: existing.key_preview,
      defaultModel: existing.default_model,
      isDefault: true,
      createdAt: existing.created_at,
      updatedAt: Date.now(),
    };
  }

  /**
   * Test connection to a provider's model endpoint and measure latency
   */
  public async testConnection(params: {
    baseUrl: string;
    apiKey: string;
  }): Promise<{ status: 'ok' | 'error'; latencyMs: number; modelCount: number; message?: string }> {
    const startTime = Date.now();
    const normalizedUrl = validateBaseUrl(params.baseUrl);

    const client = new OpenAI({
      apiKey: params.apiKey,
      baseURL: normalizedUrl,
      timeout: 12000,
      maxRetries: 0,
    });

    try {
      const response = await client.models.list();
      const latencyMs = Date.now() - startTime;
      const count = response.data ? response.data.length : 0;

      return {
        status: 'ok',
        latencyMs,
        modelCount: count,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      let message = err.message || 'Connection failed';
      if (err.status === 401) {
        message = 'Invalid API key or unauthorized.';
      } else if (err.status === 404) {
        message = 'Model endpoint not found on this Base URL (expected /models).';
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        message = 'Could not reach server at this Base URL.';
      }
      return {
        status: 'error',
        latencyMs,
        modelCount: 0,
        message,
      };
    }
  }

  /**
   * Discover models from a provider
   */
  public async discoverModels(params: {
    baseUrl: string;
    apiKey: string;
  }): Promise<NormalizedModel[]> {
    const normalizedUrl = validateBaseUrl(params.baseUrl);

    const client = new OpenAI({
      apiKey: params.apiKey,
      baseURL: normalizedUrl,
      timeout: 15000,
      maxRetries: 0,
    });

    const response = await client.models.list();
    const modelsList = response.data || [];

    return modelsList.map((model) => {
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
        ownedBy: model.owned_by || 'custom',
        created: model.created || Math.floor(Date.now() / 1000),
        isClaude,
        capabilities: {
          streaming: true,
          vision: isVision,
          reasoning: isReasoning,
        },
      };
    });
  }
}

export const providerService = new ProviderService();
