import { useState, useRef, useCallback } from 'react';
import { apiService } from '../services/api.js';
import type { Message, Conversation, AppSettings } from '../types/index.js';

export const useChat = (params: {
  activeConversation: Conversation | null;
  selectedModelId: string;
  settings: AppSettings;
  providerId?: string | null;
  updateConversationMessages: (
    convId: string,
    updater: Message[] | ((prev: Message[]) => Message[])
  ) => void;
  createNewConversation: (modelId?: string) => Promise<Conversation>;
}) => {
  const {
    activeConversation,
    selectedModelId,
    settings,
    providerId,
    updateConversationMessages,
    createNewConversation,
  } = params;

  const [isGenerating, setIsGenerating] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentTargetConvIdRef = useRef<string | null>(null);

  /**
   * Stop/Cancel ongoing generation
   */
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (activeRequestId) {
      apiService.cancelStream(activeRequestId).catch(console.warn);
      setActiveRequestId(null);
    }
    setIsGenerating(false);

    const convId = currentTargetConvIdRef.current || activeConversation?.id;
    if (convId) {
      updateConversationMessages(convId, (prev) =>
        prev.map((m) =>
          m.status === 'streaming' || m.status === 'sending'
            ? { ...m, status: 'complete' }
            : m
        )
      );
    }
  }, [activeRequestId, activeConversation, updateConversationMessages]);

  /**
   * Send a chat message
   */
  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isGenerating) return;

      let convId = activeConversation?.id;
      let existingMessages = activeConversation?.messages || [];

      // If no active conversation, create one immediately
      if (!convId) {
        const newConv = await createNewConversation(selectedModelId);
        convId = newConv.id;
        existingMessages = [];
      }

      currentTargetConvIdRef.current = convId;

      const userMessageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const assistantMessageId = 'msg_' + (Date.now() + 1) + '_' + Math.random().toString(36).slice(2, 6);

      const userMsg: Message = {
        id: userMessageId,
        conversationId: convId,
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
        status: 'complete',
      };

      const assistantMsg: Message = {
        id: assistantMessageId,
        conversationId: convId,
        role: 'assistant',
        content: '',
        createdAt: Date.now() + 1,
        status: settings.stream ? 'streaming' : 'sending',
      };

      // 1. Immediately display user message and assistant placeholder
      updateConversationMessages(convId, (prev) => [...prev, userMsg, assistantMsg]);

      // 2. Prepare payload with complete history
      const priorMessages = existingMessages.filter((m) => m.status !== 'error');
      const messagesPayload: { role: string; content: string }[] = [];

      if (settings.systemPrompt.trim()) {
        messagesPayload.push({
          role: 'system',
          content: settings.systemPrompt.trim(),
        });
      }

      for (const m of priorMessages) {
        messagesPayload.push({
          role: m.role,
          content: m.content,
        });
      }
      messagesPayload.push({
        role: 'user',
        content: trimmed,
      });

      setIsGenerating(true);
      const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      setActiveRequestId(requestId);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const targetId = convId;

      try {
        if (settings.stream) {
          let accumulatedContent = '';
          let accumulatedReasoning = '';

          await apiService.streamChatMessage(
            {
              model: selectedModelId,
              messages: messagesPayload,
              temperature: settings.temperature,
              max_tokens: settings.maxTokens,
              requestId,
              providerId: providerId || undefined,
            },
            {
              onInit: () => {},
              onChunk: (chunkText, reasoning) => {
                accumulatedContent += chunkText;
                if (reasoning) {
                  accumulatedReasoning += reasoning;
                }

                updateConversationMessages(targetId, (prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content: accumulatedContent,
                          reasoningContent: accumulatedReasoning || undefined,
                          status: 'streaming',
                        }
                      : m
                  )
                );
              },
              onDone: () => {
                setIsGenerating(false);
                setActiveRequestId(null);
                updateConversationMessages(targetId, (prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, status: 'complete' }
                      : m
                  )
                );
              },
              onError: (error) => {
                setIsGenerating(false);
                setActiveRequestId(null);
                updateConversationMessages(targetId, (prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          status: 'error',
                          error: error.message || 'Stream generation failed',
                        }
                      : m
                  )
                );
              },
            },
            controller.signal
          );
        } else {
          // Non-streaming completion
          const completion = await apiService.sendChatMessage({
            model: selectedModelId,
            messages: messagesPayload,
            temperature: settings.temperature,
            max_tokens: settings.maxTokens,
            requestId,
            providerId: providerId || undefined,
          });

          const responseText = completion.choices?.[0]?.message?.content || '';
          updateConversationMessages(targetId, (prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: responseText,
                    status: 'complete',
                  }
                : m
            )
          );
          setIsGenerating(false);
          setActiveRequestId(null);
        }
      } catch (error: any) {
        if (controller.signal.aborted) {
          updateConversationMessages(targetId, (prev) =>
            prev.map((m) =>
              m.id === assistantMessageId ? { ...m, status: 'complete' } : m
            )
          );
        } else {
          updateConversationMessages(targetId, (prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    status: 'error',
                    error: error.message || 'Failed to generate response',
                  }
                : m
            )
          );
        }
        setIsGenerating(false);
        setActiveRequestId(null);
      }
    },
    [
      isGenerating,
      activeConversation,
      selectedModelId,
      settings,
      createNewConversation,
      updateConversationMessages,
    ]
  );

  /**
   * Regenerate response for the last assistant message
   */
  const regenerateResponse = useCallback(
    async (assistantMsgId?: string) => {
      if (!activeConversation || isGenerating) return;
      const msgs = activeConversation.messages;
      if (msgs.length === 0) return;

      let targetAssistantIndex = msgs.length - 1;
      if (assistantMsgId) {
        targetAssistantIndex = msgs.findIndex((m) => m.id === assistantMsgId);
      }
      if (targetAssistantIndex < 0) return;

      let userIndex = -1;
      for (let i = targetAssistantIndex; i >= 0; i--) {
        if (msgs[i].role === 'user') {
          userIndex = i;
          break;
        }
      }
      if (userIndex < 0) return;

      const userText = msgs[userIndex].content;
      const historyToKeep = msgs.slice(0, userIndex);

      updateConversationMessages(activeConversation.id, historyToKeep);
      await sendMessage(userText);
    },
    [activeConversation, isGenerating, updateConversationMessages, sendMessage]
  );

  /**
   * Edit a user message and resubmit from that point
   */
  const editAndResubmit = useCallback(
    async (messageId: string, newContent: string) => {
      if (!activeConversation || isGenerating) return;
      const msgs = activeConversation.messages;
      const index = msgs.findIndex((m) => m.id === messageId);
      if (index === -1) return;

      const historyBefore = msgs.slice(0, index);
      updateConversationMessages(activeConversation.id, historyBefore);
      await sendMessage(newContent);
    },
    [activeConversation, isGenerating, updateConversationMessages, sendMessage]
  );

  return {
    isGenerating,
    sendMessage,
    stopGeneration,
    regenerateResponse,
    editAndResubmit,
  };
};
