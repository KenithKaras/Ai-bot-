import React from 'react';
import { Menu, Plus, Trash2, Settings, Sparkles } from 'lucide-react';
import { ModelSelector } from '../model/ModelSelector.js';
import type { Model, Conversation } from '../../types/index.js';

interface TopNavProps {
  onToggleMobileDrawer: () => void;
  onNewConversation: () => void;
  onClearConversation?: () => void;
  onOpenSettings: () => void;
  activeConversation: Conversation | null;
  models: Model[];
  selectedModelId: string;
  selectedModel: Model | null;
  isLoadingModels: boolean;
  modelError: string | null;
  onSelectModel: (modelId: string) => void;
  onRefreshModels: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  onToggleMobileDrawer,
  onNewConversation,
  onClearConversation,
  onOpenSettings,
  activeConversation,
  models,
  selectedModelId,
  selectedModel,
  isLoadingModels,
  modelError,
  onSelectModel,
  onRefreshModels,
}) => {
  return (
    <header className="h-14 px-3 md:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-surface-950/80 backdrop-blur-md flex items-center justify-between gap-3 z-10 select-none">
      {/* Left: Mobile Menu & Conversation Title */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <button
          onClick={onToggleMobileDrawer}
          className="p-2 rounded-xl md:hidden hover:bg-slate-100 dark:hover:bg-surface-850 text-slate-600 dark:text-slate-300 transition"
          title="Open conversation list"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile New Chat */}
        <button
          onClick={onNewConversation}
          className="p-2 rounded-xl md:hidden hover:bg-slate-100 dark:hover:bg-surface-850 text-slate-600 dark:text-slate-300 transition"
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
        </button>

        {/* Active Title */}
        <div className="hidden sm:flex items-center gap-2 min-w-0 max-w-xs md:max-w-md">
          <Sparkles className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <h1 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
            {activeConversation?.title || 'New Conversation'}
          </h1>
        </div>
      </div>

      {/* Center/Right: Model Selector & Actions */}
      <div className="flex items-center gap-2">
        <ModelSelector
          models={models}
          selectedModelId={selectedModelId}
          selectedModel={selectedModel}
          isLoading={isLoadingModels}
          error={modelError}
          onSelectModel={onSelectModel}
          onRefresh={onRefreshModels}
        />

        {/* Clear active conversation messages */}
        {activeConversation && Array.isArray(activeConversation.messages) && activeConversation.messages.length > 0 && onClearConversation && (
          <button
            onClick={onClearConversation}
            className="p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-500 transition hidden sm:flex"
            title="Clear conversation messages"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-surface-850 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
