import React, { useState, useRef, useEffect } from 'react';
import { Menu, Plus, Trash2, Settings, Sparkles, LogIn, LogOut, ChevronDown, Server } from 'lucide-react';
import { ModelSelector } from '../model/ModelSelector.js';
import { useAuth } from '../../hooks/useAuth.js';
import type { Model, Conversation, SafeProvider } from '../../types/index.js';

interface TopNavProps {
  onToggleMobileDrawer: () => void;
  onNewConversation: () => void;
  onClearConversation?: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
  activeConversation: Conversation | null;
  models: Model[];
  selectedModelId: string;
  selectedModel: Model | null;
  isLoadingModels: boolean;
  modelError: string | null;
  onSelectModel: (modelId: string) => void;
  onRefreshModels: () => void;
  selectedProvider?: SafeProvider | null;
}

export const TopNav: React.FC<TopNavProps> = ({
  onToggleMobileDrawer,
  onNewConversation,
  onClearConversation,
  onOpenSettings,
  onOpenAuth,
  activeConversation,
  models,
  selectedModelId,
  selectedModel,
  isLoadingModels,
  modelError,
  onSelectModel,
  onRefreshModels,
  selectedProvider,
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
  };

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

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
        {/* Active Gateway Badge */}
        <button
          onClick={onOpenSettings}
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface-850 hover:border-emerald-500/40 text-slate-700 dark:text-slate-300 text-xs transition"
          title="Active Gateway Provider (Click to configure)"
        >
          <Server className="w-3.5 h-3.5 text-emerald-500" />
          <span className="truncate max-w-[110px] font-medium">
            {selectedProvider ? selectedProvider.name : 'Radox AI'}
          </span>
        </button>

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

        {/* Auth / Account Button */}
        {isAuthenticated && user ? (
          <div className="relative inline-block text-left" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center gap-1.5 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-surface-850 text-slate-700 dark:text-slate-200 transition"
              title={`Logged in as ${user.name}`}
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {userInitial}
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-slate-800 shadow-2xl py-1.5 z-50 text-xs">
                <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{user.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenSettings();
                    }}
                    className="w-full px-3.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-surface-850 text-slate-700 dark:text-slate-300 flex items-center gap-2"
                  >
                    <Settings className="w-3.5 h-3.5 text-slate-400" />
                    <span>Settings & Preferences</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full px-3.5 py-2 text-left hover:bg-rose-50 dark:hover:bg-rose-950/20 text-rose-500 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition active:scale-95"
            title="Sign In or Register"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
