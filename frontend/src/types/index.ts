export type Role = 'user' | 'assistant' | 'system';

export type MessageStatus = 'sending' | 'streaming' | 'complete' | 'error';

export interface Message {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  reasoningContent?: string;
  createdAt: number;
  status: MessageStatus;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface ModelCapabilities {
  streaming: boolean;
  vision: boolean;
  reasoning: boolean;
}

export interface Model {
  id: string;
  name: string;
  ownedBy: string;
  created: number;
  isClaude: boolean;
  capabilities: ModelCapabilities;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  defaultModel: string;
  stream: boolean;
  temperature: number;
  maxTokens?: number;
  systemPrompt: string;
}

export interface ProviderStatus {
  status: 'idle' | 'checking' | 'connected' | 'error';
  latencyMs?: number;
  modelCount?: number;
  message?: string;
}
