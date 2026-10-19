import React, { useState } from 'react';
import {
  Plus,
  Search,
  MessageSquare,
  Trash2,
  Pencil,
  Check,
  X,
  Settings,
  Sparkles,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Conversation, AppSettings } from '../../types/index.js';

interface SidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeConversationId,
  searchQuery,
  onSearchChange,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  onOpenSettings,
  settings,
  onUpdateSettings,
  isCollapsed,
  onToggleCollapse,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleStartRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveRename = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (editTitle.trim()) {
      onRenameConversation(id, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const toggleTheme = () => {
    onUpdateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  return (
    <aside
      className={`relative flex flex-col h-full bg-slate-50 dark:bg-surface-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 select-none ${
        isCollapsed ? 'w-[68px]' : 'w-72'
      }`}
    >
      {/* Header with App Logo and New Chat */}
      <div className="p-3 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                Radox AI
              </h2>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                Claude Ready
              </span>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewConversation}
          className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm hover:shadow transition active:scale-[0.98] ${
            isCollapsed ? 'px-0' : ''
          }`}
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
          {!isCollapsed && <span>New Conversation</span>}
        </button>
      </div>

      {/* Search Bar */}
      {!isCollapsed && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-surface-850 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      )}

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {conversations.length === 0 ? (
          !isCollapsed && (
            <div className="text-center py-8 text-xs text-slate-400">
              No conversations yet.
            </div>
          )
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = editingId === conv.id;

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium cursor-pointer transition ${
                  isActive
                    ? 'bg-slate-200 dark:bg-surface-850 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-850/60 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title={conv.title}
              >
                <MessageSquare className="w-4 h-4 flex-shrink-0 text-slate-400 group-hover:text-emerald-500" />

                {!isCollapsed && (
                  <>
                    {isEditing ? (
                      <div
                        className="flex-1 flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(conv.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          className="w-full px-1.5 py-0.5 text-xs bg-white dark:bg-surface-900 border border-emerald-500 rounded text-slate-900 dark:text-slate-100 focus:outline-none"
                        />
                        <button
                          onClick={(e) => handleSaveRename(conv.id, e)}
                          className="p-1 hover:text-emerald-500"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        </button>
                        <button
                          onClick={handleCancelRename}
                          className="p-1 hover:text-rose-500"
                        >
                          <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 truncate">{conv.title}</span>

                        {/* Hover Actions: Edit & Delete */}
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                          <button
                            onClick={(e) => handleStartRename(conv, e)}
                            className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            title="Rename chat"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteConversation(conv.id);
                            }}
                            className="p-1 hover:bg-rose-500/20 rounded text-slate-400 hover:text-rose-500"
                            title="Delete chat"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Theme toggle & Settings */}
      <div className="p-3 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-1">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 p-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-surface-850 hover:text-slate-900 dark:hover:text-slate-200 transition"
          title="Open Settings"
        >
          <Settings className="w-4 h-4" />
          {!isCollapsed && <span>Settings</span>}
        </button>

        {!isCollapsed && (
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-surface-850 hover:text-slate-900 dark:hover:text-slate-200 transition"
            title="Toggle theme"
          >
            {settings.theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        )}
      </div>
    </aside>
  );
};
