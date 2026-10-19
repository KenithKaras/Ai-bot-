import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface MessageComposerProps {
  onSendMessage: (content: string) => void;
  onStopGeneration: () => void;
  isGenerating: boolean;
  disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSendMessage,
  onStopGeneration,
  isGenerating,
  disabled = false,
}) => {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-resize textarea as user types
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 200);
      textarea.style.height = `${Math.max(newHeight, 48)}px`;
    }
  }, [content]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends message, Shift+Enter inserts newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmed = content.trim();
    if (!trimmed || isGenerating || disabled) return;
    onSendMessage(trimmed);
    setContent('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4 pt-1">
      <div className="relative flex items-end gap-2 rounded-2xl border border-slate-300 dark:border-slate-700/80 bg-white dark:bg-surface-900 shadow-md focus-within:border-emerald-500/80 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all p-1.5 md:p-2">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question or request code... (Shift+Enter for newline)"
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent px-3 py-2 text-[15px] leading-relaxed text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none max-h-48 overflow-y-auto"
        />

        {/* Action Button: Send or Stop */}
        <div className="flex items-center self-end pb-1 pr-1">
          {isGenerating ? (
            <button
              onClick={onStopGeneration}
              type="button"
              className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition active:scale-95 flex items-center justify-center"
              title="Stop generation"
            >
              <Square className="w-4 h-4 fill-white" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!content.trim() || disabled}
              type="button"
              className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition disabled:opacity-40 disabled:hover:bg-emerald-600 active:scale-95 flex items-center justify-center"
              title="Send message (Enter)"
            >
              <ArrowUp className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 px-2 text-[11px] text-slate-400 dark:text-slate-500 select-none">
        <span>Press <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono text-[10px]">Enter</kbd> to send, <kbd className="px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono text-[10px]">Shift+Enter</kbd> for new line</span>
        {content.length > 0 && <span>{content.length} chars</span>}
      </div>
    </div>
  );
};
