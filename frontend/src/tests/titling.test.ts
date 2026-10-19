import { describe, it, expect } from 'vitest';
import { generateTitleFromText } from '../hooks/useConversations.js';

describe('Local Title Generation', () => {
  it('should return default title for empty or whitespace text', () => {
    expect(generateTitleFromText('')).toBe('New Conversation');
    expect(generateTitleFromText('    ')).toBe('New Conversation');
  });

  it('should clean markdown characters and excess whitespace', () => {
    const raw = '# Hello **world**! How are you?';
    expect(generateTitleFromText(raw)).toBe('Hello world! How are you?');
  });

  it('should truncate at clean word boundary under 36 characters', () => {
    const longPrompt = 'Can you help me design a resilient distributed microservices architecture?';
    const title = generateTitleFromText(longPrompt);
    expect(title.length).toBeLessThanOrEqual(40);
    expect(title.endsWith('...')).toBe(true);
  });
});
