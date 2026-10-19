import React, { useState } from 'react';
import {
  Copy,
  Check,
  RotateCcw,
  Pencil,
  AlertCircle,
  User,
  Sparkles,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer.js';
import { TypingIndicator } from './TypingIndicator.js';
import type { Message } from '../../types/index.js';

interface MessageItemProps {
  message: Message;
  isLast: boolean;
  isGenerating: boolean;
  onRegenerate?: () => void;
  onEditAndResubmit?: (messageId: string, newContent: string) => void;
  onRetry?: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  isLast,
  isGenerating,
  onRegenerate,
  onEditAndResubmit,
  onRetry,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showReasoning, setShowReasoning] = useState(false);

  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isStreaming = message.status === 'streaming';
  const isError = message.status === 'error';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy message', e);
    }
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && onEditAndResubmit) {
      onEditAndResubmit(message.id, editContent.trim());
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`group relative py-4 px-4 sm:px-6 md:px-8 transition-colors ${
        isUser
          ? 'bg-transparent'
          : 'bg-white dark:bg-surface-900/50 border-y border-slate-200/70 dark:border-slate-800/60 shadow-sm'
      }`}
    >
      <div className="max-w-3xl mx-auto flex gap-3.5 sm:gap-4 items-start">
        {/* Avatar */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm text-sm font-semibold select-none ${
            isUser
              ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              : 'bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 text-white shadow-emerald-500/20'
          }`}
        >
          {isUser ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        </div>

        {/* Message Content Container */}
        <div className="flex-1 min-w-0">
          {/* Header Info */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {isUser ? 'You' : 'Radox AI'}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          {/* Reasoning collapsible block if present */}
          {message.reasoningContent && (
            <div className="my-2.5 p-3 rounded-xl border border-purple-500/30 bg-purple-50/50 dark:bg-purple-950/20 text-xs text-purple-900 dark:text-purple-200">
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="flex items-center gap-1.5 font-semibold text-purple-700 dark:text-purple-300 hover:underline transition"
              >
                {showReasoning ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                <span>Thinking Process ({message.reasoningContent.length} chars)</span>
              </button>
              {showReasoning && (
                <div className="mt-2.5 pl-3 border-l-2 border-purple-400 dark:border-purple-500/40 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-purple-800/90 dark:text-purple-200/80 max-h-60 overflow-y-auto">
                  {message.reasoningContent}
                </div>
              )}
            </div>
          )}

          {/* Inline Edit Form for User */}
          {isEditing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-850 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y min-h-[90px]"
                rows={3}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={!editContent.trim()}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition disabled:opacity-50"
                >
                  Save & Resubmit
                </button>
                <button
                  onClick={() => {
                    setEditContent(message.content);
                    setIsEditing(false);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Normal Message View */
            <div className="relative">
              {isUser ? (
                <div className="text-slate-900 dark:text-slate-100 whitespace-pre-wrap text-[15px] leading-relaxed">
                  {message.content}
                </div>
              ) : (
                <>
                  {message.content ? (
                    <MarkdownRenderer content={message.content} />
                  ) : isStreaming ? (
                    <div className="flex items-center gap-2 py-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <TypingIndicator />
                      <span>Generating response...</span>
                    </div>
                  ) : null}
                </>
              )}

              {/* Streaming pulse cursor */}
              {isStreaming && message.content && (
                <span className="inline-block w-2 h-4 ml-1 bg-emerald-500 animate-pulse align-middle rounded-sm" />
              )}

              {/* Error banner */}
              {isError && (
                <div className="mt-3 p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-start gap-3 text-xs leading-relaxed">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">Generation encountered an error</p>
                    <p className="mt-0.5 text-rose-700 dark:text-rose-300/90">
                      {message.error || 'Failed to complete model response.'}
                    </p>
                    {onRetry && (
                      <button
                        onClick={onRetry}
                        className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-lg text-xs transition"
                      >
                        <RotateCcw className="w-3 h-3" /> Retry Generation
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Toolbar */}
          {!isEditing && !isStreaming && (
            <div className="mt-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Copy message */}
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                title="Copy message"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Edit user message */}
              {isUser && onEditAndResubmit && (
                <button
                  onClick={() => setIsEditing(true)}
                  disabled={isGenerating}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition disabled:opacity-40"
                  title="Edit and resubmit message"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Regenerate assistant response */}
              {isAssistant && isLast && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  disabled={isGenerating}
                  className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition disabled:opacity-40"
                  title="Regenerate response"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
