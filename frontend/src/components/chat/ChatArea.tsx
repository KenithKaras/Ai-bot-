import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowDown } from 'lucide-react';
import { MessageItem } from './MessageItem.js';
import { EmptyState } from './EmptyState.js';
import { MessageComposer } from './MessageComposer.js';
import type { Conversation, Model } from '../../types/index.js';

interface ChatAreaProps {
  activeConversation: Conversation | null;
  selectedModel: Model | null;
  selectedModelId: string;
  isGenerating: boolean;
  onSendMessage: (content: string) => void;
  onStopGeneration: () => void;
  onRegenerate: () => void;
  onEditAndResubmit: (messageId: string, newContent: string) => void;
  onRetry: () => void;
  hasProviders?: boolean;
  onOpenSettings?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  activeConversation,
  selectedModel,
  selectedModelId,
  isGenerating,
  onSendMessage,
  onStopGeneration,
  onRegenerate,
  onEditAndResubmit,
  onRetry,
  hasProviders = true,
  onOpenSettings,
}) => {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

  const messages = activeConversation?.messages || [];

  // Check if user has scrolled away from bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
    setUserHasScrolledUp(distanceToBottom > 100);
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
    });
    setUserHasScrolledUp(false);
  }, []);

  // Auto-scroll when messages update or streaming continues, unless user manually scrolled up
  useEffect(() => {
    if (!userHasScrolledUp) {
      scrollToBottom(false);
    }
  }, [messages, userHasScrolledUp, scrollToBottom]);

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-surface-950">
      {/* Scrollable Message Container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col"
      >
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[400px]">
            <EmptyState
              selectedModel={selectedModel}
              selectedModelId={selectedModelId}
              onSelectPrompt={onSendMessage}
              hasProviders={hasProviders}
              onOpenSettings={onOpenSettings}
            />
          </div>
        ) : (
          <div className="py-6 flex flex-col space-y-1">
            {messages.map((message, idx) => (
              <MessageItem
                key={message.id}
                message={message}
                isLast={idx === messages.length - 1}
                isGenerating={isGenerating}
                onRegenerate={onRegenerate}
                onEditAndResubmit={onEditAndResubmit}
                onRetry={onRetry}
              />
            ))}
            <div ref={messagesEndRef} className="h-6" />
          </div>
        )}
      </div>

      {/* Floating Scroll-to-Bottom button */}
      {userHasScrolledUp && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-28 right-8 px-3 py-2 rounded-full bg-slate-900/90 dark:bg-slate-700/90 text-white shadow-xl hover:bg-slate-800 dark:hover:bg-slate-600 transition duration-150 z-20 flex items-center gap-2 text-xs font-medium backdrop-blur-sm"
        >
          <ArrowDown className="w-4 h-4" />
          <span>New messages</span>
        </button>
      )}

      {/* Fixed Composer Bottom */}
      <div className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-surface-950/80 backdrop-blur-md pt-2">
        <MessageComposer
          onSendMessage={onSendMessage}
          onStopGeneration={onStopGeneration}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  );
};
