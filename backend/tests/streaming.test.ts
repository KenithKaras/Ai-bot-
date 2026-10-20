import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { initDatabase, closeDb } from '../src/db/database.js';
import { authService } from '../src/services/authService.js';
import { aiProviderService } from '../src/services/aiProvider.js';

describe('Streaming Route', () => {
  let app: any;
  let testSession: any;

  beforeEach(async () => {
    closeDb();
    initDatabase(':memory:');
    app = createApp();

    const { session } = await authService.register({
      email: 'stream-tester@example.com',
      password: 'SecurePassword123!',
      name: 'Stream Tester',
    });
    testSession = session;
  });

  afterAll(() => {
    closeDb();
  });

  it('POST /api/chat/stream should reject unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/api/chat/stream')
      .send({
        model: 'claude-3-7-sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
        requestId: 'stream-test-unauth',
      });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/chat/stream should stream SSE events for authenticated user', async () => {
    vi.spyOn(aiProviderService, 'streamChatCompletion').mockImplementation(
      async (_params, callbacks) => {
        callbacks.onChunk({ content: 'Hello' });
        callbacks.onChunk({ content: ' world' });
        callbacks.onDone('stop');
      }
    );

    const res = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', `Bearer ${testSession.id}`)
      .send({
        model: 'claude-3-7-sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
        requestId: 'stream-test-1',
      })
      .expect('Content-Type', /text\/event-stream/)
      .expect(200);

    const text = res.text;
    expect(text).toContain('event: init');
    expect(text).toContain('stream-test-1');
    expect(text).toContain('event: chunk');
    expect(text).toContain('Hello');
    expect(text).toContain('world');
    expect(text).toContain('event: done');
  });

  it('POST /api/chat/stream should emit error event on provider failure for authenticated user', async () => {
    vi.spyOn(aiProviderService, 'streamChatCompletion').mockImplementation(
      async (_params, callbacks) => {
        callbacks.onError(new Error('Radox AI upstream error'));
      }
    );

    const res = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', `Bearer ${testSession.id}`)
      .send({
        model: 'claude-3-7-sonnet',
        messages: [{ role: 'user', content: 'Hi' }],
        requestId: 'stream-test-err',
      })
      .expect('Content-Type', /text\/event-stream/)
      .expect(200);

    const text = res.text;
    expect(text).toContain('event: error');
    expect(text).toContain('Radox AI upstream error');
  });
});
