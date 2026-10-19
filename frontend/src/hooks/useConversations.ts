import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { storageService } from '../services/storage.js';
import type { Conversation, Message } from '../types/index.js';

export const generateTitleFromText = (text: string): string => {
  if (!text || !text.trim()) return 'New Conversation';
  const clean = text
    .replace(/[#*`_~>[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= 36) return clean;
  const truncated = clean.slice(0, 36);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 15 ? truncated.slice(0, lastSpace) : truncated) + '...';
};

export const useConversations = (defaultModelId: string) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Create new conversation
  const createNewConversation = useCallback(
    async (modelId?: string): Promise<Conversation> => {
      const newConv: Conversation = {
        id: 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title: 'New Conversation',
        model: modelId || defaultModelId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };

      await storageService.saveConversation(newConv);
      setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)]);
      setActiveConversationId(newConv.id);
      activeIdRef.current = newConv.id;
      return newConv;
    },
    [defaultModelId]
  );

  // Load conversations from IndexedDB
  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await storageService.getConversations();
      if (items.length > 0) {
        setConversations(items);
        setActiveConversationId((prev) => prev || items[0].id);
      } else {
        // Create initial clean conversation so user always has a ready chat
        const initial = await createNewConversation();
        setConversations([initial]);
        setActiveConversationId(initial.id);
      }
    } catch (e) {
      console.error('Failed to load conversations from storage', e);
    } finally {
      setIsLoading(false);
    }
  }, [createNewConversation]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Save/Update conversation
  const saveConversation = useCallback(async (updated: Conversation) => {
    await storageService.saveConversation(updated);
    setConversations((prev) => {
      const index = prev.findIndex((c) => c.id === updated.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = updated;
        return next.sort((a, b) => b.updatedAt - a.updatedAt);
      }
      return [updated, ...prev];
    });
  }, []);

  // Rename conversation
  const renameConversation = useCallback(
    async (id: string, newTitle: string) => {
      setConversations((prev) => {
        const target = prev.find((c) => c.id === id);
        if (!target) return prev;
        const updated: Conversation = {
          ...target,
          title: newTitle.trim() || 'Untitled',
          updatedAt: Date.now(),
        };
        storageService.saveConversation(updated).catch(console.error);
        return prev.map((c) => (c.id === id ? updated : c));
      });
    },
    []
  );

  // Delete conversation
  const deleteConversation = useCallback(
    async (id: string) => {
      await storageService.deleteConversation(id);
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (activeIdRef.current === id) {
          const nextId = next.length > 0 ? next[0].id : null;
          setActiveConversationId(nextId);
          activeIdRef.current = nextId;
        }
        return next;
      });
    },
    []
  );

  // Clear all conversations
  const clearAllConversations = useCallback(async () => {
    await storageService.clearAllConversations();
    const fresh = await createNewConversation();
    setConversations([fresh]);
    setActiveConversationId(fresh.id);
  }, [createNewConversation]);

  // Active conversation object
  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeConversationId) || null;
  }, [conversations, activeConversationId]);

  // Filtered conversations by search query
  const filteredConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  // Robust updater targeting a specific conversation by ID
  const updateConversationMessages = useCallback(
    (
      convId: string,
      messagesOrUpdater: Message[] | ((prev: Message[]) => Message[])
    ) => {
      setConversations((prevList) => {
        const index = prevList.findIndex((c) => c.id === convId);
        if (index === -1) return prevList;

        const currentConv = prevList[index];
        const nextMsgs =
          typeof messagesOrUpdater === 'function'
            ? messagesOrUpdater(currentConv.messages)
            : messagesOrUpdater;

        let title = currentConv.title;
        if (title === 'New Conversation' && nextMsgs.length > 0) {
          const firstUser = nextMsgs.find((m) => m.role === 'user');
          if (firstUser) {
            title = generateTitleFromText(firstUser.content);
          }
        }

        const updated: Conversation = {
          ...currentConv,
          title,
          updatedAt: Date.now(),
          messages: nextMsgs,
        };

        // Persist to IndexedDB asynchronously
        storageService.saveConversation(updated).catch(console.error);

        const nextList = [...prevList];
        nextList[index] = updated;
        return nextList.sort((a, b) => b.updatedAt - a.updatedAt);
      });
    },
    []
  );

  return {
    conversations,
    filteredConversations,
    activeConversation,
    activeConversationId,
    setActiveConversationId,
    searchQuery,
    setSearchQuery,
    isLoading,
    createNewConversation,
    saveConversation,
    renameConversation,
    deleteConversation,
    clearAllConversations,
    updateConversationMessages,
  };
};
