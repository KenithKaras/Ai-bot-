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

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  refreshToken?: string;
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

export interface ProviderCreateInput {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
  isDefault?: boolean;
}

export interface ProviderUpdateInput {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  isDefault?: boolean;
}
