import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { aiProviderService } from '../src/services/aiProvider.js';

describe('Streaming Route', () => {
  const app = createApp();

  it('POST /api/chat/stream should stream SSE events', async () => {
    vi.spyOn(aiProviderService, 'streamChatCompletion').mockImplementation(
      async (_params, callbacks) => {
        callbacks.onChunk({ content: 'Hello' });
        callbacks.onChunk({ content: ' world' });
        callbacks.onDone('stop');
      }
    );

    const res = await request(app)
      .post('/api/chat/stream')
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

  it('POST /api/chat/stream should emit error event on provider failure', async () => {
    vi.spyOn(aiProviderService, 'streamChatCompletion').mockImplementation(
      async (_params, callbacks) => {
        callbacks.onError(new Error('Radox AI upstream error'));
      }
    );

    const res = await request(app)
      .post('/api/chat/stream')
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
