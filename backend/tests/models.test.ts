import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, closeDb } from '../src/db/database.js';
import { authService } from '../src/services/authService.js';
import { aiProviderService } from '../src/services/aiProvider.js';

describe('Models Route', () => {
  let app: any;
  let testSession: any;

  beforeEach(async () => {
    closeDb();
    initDatabase(':memory:');
    app = createApp();

    const { session } = await authService.register({
      email: 'models-test@example.com',
      password: 'SecurePassword123!',
      name: 'Models Tester',
    });
    testSession = session;
  });

  afterAll(() => {
    closeDb();
  });

  it('GET /api/models should reject unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/models');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/models should return normalized model list for authenticated user', async () => {
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

    const res = await request(app)
      .get('/api/models')
      .set('Authorization', `Bearer ${testSession.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.count).toBe(2);
    expect(res.body.data[0].id).toBe('claude-3-7-sonnet');
    expect(res.body.data[0].isClaude).toBe(true);
  });

  it('GET /api/models should handle provider errors safely for authenticated user', async () => {
    vi.spyOn(aiProviderService, 'listModels').mockRejectedValue(
      new Error('Invalid or unauthorized Radox AI API key. Please check your credentials.')
    );

    const res = await request(app)
      .get('/api/models')
      .set('Authorization', `Bearer ${testSession.id}`);

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.message).toContain('Invalid or unauthorized Radox AI API key');
  });
});
