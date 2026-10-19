import { describe, it, expect, beforeEach } from 'vitest';
import { storageService } from '../services/storage.js';
import type { Conversation } from '../types/index.js';

describe('Storage Service (Modular Persistence)', () => {
  beforeEach(async () => {
    await storageService.clearAllConversations();
  });

  it('should save and retrieve a conversation', async () => {
    const testConv: Conversation = {
      id: 'conv-test-1',
      title: 'Testing Radox Integration',
      model: 'claude-3-7-sonnet',
      createdAt: 1000,
      updatedAt: 1000,
      messages: [
        {
          id: 'msg-1',
          conversationId: 'conv-test-1',
          role: 'user',
          content: 'Hello Claude',
          createdAt: 1000,
          status: 'complete',
        },
      ],
    };

    await storageService.saveConversation(testConv);
    const retrieved = await storageService.getConversation('conv-test-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe('conv-test-1');
    expect(retrieved?.messages.length).toBe(1);
  });

  it('should delete a conversation', async () => {
    const testConv: Conversation = {
      id: 'conv-test-2',
      title: 'To Be Deleted',
      model: 'claude-3-7-sonnet',
      createdAt: 1000,
      updatedAt: 1000,
      messages: [],
    };

    await storageService.saveConversation(testConv);
    await storageService.deleteConversation('conv-test-2');
    const retrieved = await storageService.getConversation('conv-test-2');
    expect(retrieved).toBeNull();
  });

  it('should search conversations across titles and message contents', async () => {
    const conv1: Conversation = {
      id: 'conv-1',
      title: 'Python Scripting',
      model: 'claude-3-7-sonnet',
      createdAt: 1000,
      updatedAt: 1000,
      messages: [],
    };
    const conv2: Conversation = {
      id: 'conv-2',
      title: 'Database Design',
      model: 'claude-3-7-sonnet',
      createdAt: 2000,
      updatedAt: 2000,
      messages: [
        {
          id: 'msg-2',
          conversationId: 'conv-2',
          role: 'user',
          content: 'How do I index PostgreSQL JSONB?',
          createdAt: 2000,
          status: 'complete',
        },
      ],
    };

    await storageService.saveConversation(conv1);
    await storageService.saveConversation(conv2);

    const results = await storageService.searchConversations('JSONB');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('conv-2');
  });
});
