import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, closeDb } from '../src/db/database.js';
import { authService } from '../src/services/authService.js';
import { aiProviderService } from '../src/services/aiProvider.js';

describe('Chat Routes', () => {
  let app: any;
  let testSession: any;

  beforeEach(async () => {
    closeDb();
    initDatabase(':memory:');
    app = createApp();

    const { session } = await authService.register({
      email: 'chat-tester@example.com',
      password: 'SecurePassword123!',
      name: 'Chat Tester',
    });
    testSession = session;
  });

  afterAll(() => {
    closeDb();
  });

  describe('Authentication Enforcement', () => {
    it('should reject unauthenticated requests to POST /api/chat with 401', async () => {
      const res = await request(app)
        .post('/api/chat')
        .send({
          model: 'claude-3-7-sonnet',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject unauthenticated requests to POST /api/chat/stream with 401', async () => {
      const res = await request(app)
        .post('/api/chat/stream')
        .send({
          model: 'claude-3-7-sonnet',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation', () => {
    it('should reject request missing model', async () => {
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${testSession.id}`)
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('Model identifier is required');
    });

    it('should reject request with empty messages array', async () => {
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${testSession.id}`)
        .send({
          model: 'claude-3-7-sonnet',
          messages: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toContain('At least one message is required');
    });

    it('should reject request with invalid role', async () => {
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${testSession.id}`)
        .send({
          model: 'claude-3-7-sonnet',
          messages: [{ role: 'invalid_role', content: 'Hello' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject empty message content', async () => {
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${testSession.id}`)
        .send({
          model: 'claude-3-7-sonnet',
          messages: [{ role: 'user', content: '' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Completion execution', () => {
    it('should successfully return completion from aiProviderService', async () => {
      vi.spyOn(aiProviderService, 'createChatCompletion').mockResolvedValue({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1710000000,
        model: 'claude-3-7-sonnet',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello there! How can I assist you?' },
            finish_reason: 'stop',
          },
        ],
      } as any);

      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${testSession.id}`)
        .send({
          model: 'claude-3-7-sonnet',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(200);
      expect(res.body.choices[0].message.content).toBe('Hello there! How can I assist you?');
    });

    it('should handle provider failure safely', async () => {
      vi.spyOn(aiProviderService, 'createChatCompletion').mockRejectedValue(
        new Error('Radox AI rate limit or balance quota exceeded.')
      );

      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${testSession.id}`)
        .send({
          model: 'claude-3-7-sonnet',
          messages: [{ role: 'user', content: 'Hello' }],
        });

      expect(res.status).toBe(500);
      expect(res.body.error.message).toContain('Radox AI rate limit or balance quota exceeded');
    });
  });

  describe('Cancellation', () => {
    it('DELETE /api/chat/stream/:requestId should invoke cancellation service', async () => {
      vi.spyOn(aiProviderService, 'cancelRequest').mockReturnValue(true);

      const res = await request(app)
        .delete('/api/chat/stream/req-test-123')
        .set('Authorization', `Bearer ${testSession.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cancelled).toBe(true);
    });
  });
});
