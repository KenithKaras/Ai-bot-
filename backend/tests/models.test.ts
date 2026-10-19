import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { aiProviderService } from '../src/services/aiProvider.js';

describe('Models Route', () => {
  const app = createApp();

  it('GET /api/models should return normalized model list with Claude models', async () => {
    vi.spyOn(aiProviderService, 'listModels').mockResolvedValue([
      {
        id: 'claude-3-7-sonnet',
        name: 'Claude 3 7 Sonnet',
        ownedBy: 'anthropic',
        created: 1710000000,
        isClaude: true,
        capabilities: { streaming: true, vision: true, reasoning: false },
      },
      {
        id: 'gpt-4o',
        name: 'Gpt 4o',
        ownedBy: 'openai',
        created: 1710000000,
        isClaude: false,
        capabilities: { streaming: true, vision: true, reasoning: false },
      },
    ]);

    const res = await request(app).get('/api/models');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.count).toBe(2);
    expect(res.body.data[0].id).toBe('claude-3-7-sonnet');
    expect(res.body.data[0].isClaude).toBe(true);
  });

  it('GET /api/models should handle provider errors safely', async () => {
    vi.spyOn(aiProviderService, 'listModels').mockRejectedValue(
      new Error('Invalid or unauthorized Radox AI API key. Please check your credentials.')
    );

    const res = await request(app).get('/api/models');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.message).toContain('Invalid or unauthorized Radox AI API key');
  });
});
