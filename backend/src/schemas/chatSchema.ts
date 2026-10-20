import { z } from 'zod';

export const RoleSchema = z.enum(['system', 'user', 'assistant']);
export type Role = z.infer<typeof RoleSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().optional(),
  role: RoleSchema,
  content: z.string().min(1, 'Message content cannot be empty').max(100000, 'Message exceeds 100,000 characters limit'),
  createdAt: z.number().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatRequestSchema = z.object({
  model: z.string({ required_error: 'Model identifier is required' }).min(1, 'Model identifier is required'),
  messages: z.array(ChatMessageSchema, { required_error: 'At least one message is required' }).min(1, 'At least one message is required'),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  max_tokens: z.number().int().positive().max(32000).optional(),
  stream: z.boolean().optional().default(false),
  requestId: z.string().optional(),
  providerId: z.string().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const CancelRequestSchema = z.object({
  requestId: z.string().min(1, 'Request ID is required'),
});
