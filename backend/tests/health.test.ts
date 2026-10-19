import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { aiProviderService } from '../src/services/aiProvider.js';

describe('Health Routes', () => {
  const app = createApp();

  it('GET /api/health should return ok status and server uptime', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('providerConfigured');
  });

  it('GET /api/health/provider should return error when key is not configured', async () => {
    vi.spyOn(aiProviderService, 'isConfigured').mockReturnValue(false);

    const res = await request(app).get('/api/health/provider');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.providerConfigured).toBe(false);
  });

  it('GET /api/health/provider should return ok when connection test succeeds', async () => {
    vi.spyOn(aiProviderService, 'isConfigured').mockReturnValue(true);
    vi.spyOn(aiProviderService, 'testConnection').mockResolvedValue({
      latencyMs: 120,
      modelCount: 15,
    });

    const res = await request(app).get('/api/health/provider');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.latencyMs).toBe(120);
    expect(res.body.modelCount).toBe(15);
  });
});
