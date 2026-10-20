import React, { useState } from 'react';
import {
  X,
  Moon,
  Sun,
  Monitor,
  Zap,
  Trash2,
  Activity,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RotateCw,
  LogOut,
  LogIn,
} from 'lucide-react';
import { apiService } from '../../services/api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { ProviderManager } from './ProviderManager.js';
import type {
  AppSettings,
  Model,
  ProviderStatus,
  SafeProvider,
  ProviderCreateInput,
  ProviderUpdateInput,
} from '../../types/index.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  models: Model[];
  onRefreshModels: () => void;
  onClearAllHistory: () => void;
  onOpenAuth?: () => void;
  providers?: SafeProvider[];
  selectedProviderId?: string | null;
  onSelectProvider?: (id: string | null) => void;
  onCreateProvider?: (data: ProviderCreateInput) => Promise<SafeProvider>;
  onUpdateProvider?: (id: string, data: ProviderUpdateInput) => Promise<SafeProvider>;
  onDeleteProvider?: (id: string) => Promise<void>;
  onSetDefaultProvider?: (id: string) => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  models,
  onRefreshModels,
  onClearAllHistory,
  onOpenAuth,
  providers = [],
  selectedProviderId = null,
  onSelectProvider = () => {},
  onCreateProvider = async () => ({} as SafeProvider),
  onUpdateProvider = async () => ({} as SafeProvider),
  onDeleteProvider = async () => {},
  onSetDefaultProvider = async () => {},
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>({
    status: 'idle',
  });
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  const handleTestProvider = async () => {
    setProviderStatus({ status: 'checking' });
    try {
      const res = await apiService.testProvider();
      if (res.status === 'ok') {
        setProviderStatus({
          status: 'connected',
          latencyMs: res.latencyMs,
          modelCount: res.modelCount,
        });
      } else {
        setProviderStatus({
          status: 'error',
          message: res.message || 'Provider check returned an error',
        });
      }
    } catch (e: any) {
      setProviderStatus({
        status: 'error',
        message: e?.message || 'Failed to reach backend health endpoint',
      });
    }
  };

  const handleClearHistoryConfirm = () => {
    onClearAllHistory();
    setConfirmClear(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Application Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-surface-850"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-6 overflow-y-auto flex-1 text-sm">
          {/* Account Section */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-surface-850 border border-slate-200/80 dark:border-slate-800">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
              Account
            </label>
            {isAuthenticated && user ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                      {user.name}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await logout();
                  }}
                  className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Guest Mode (Local Only)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Sign in to protect your chats and sync settings across devices.
                  </p>
                </div>
                {onOpenAuth && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenAuth();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                  >
                    <LogIn className="w-3.5 h-3.5" /> Sign In
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Custom AI Provider Gateways Section */}
          <ProviderManager
            providers={providers}
            selectedProviderId={selectedProviderId}
            onSelectProvider={onSelectProvider}
            onCreateProvider={onCreateProvider}
            onUpdateProvider={onUpdateProvider}
            onDeleteProvider={onDeleteProvider}
            onSetDefaultProvider={onSetDefaultProvider}
            isAuthenticated={isAuthenticated}
            onOpenAuth={() => {
              onClose();
              onOpenAuth?.();
            }}
          />

          {/* Appearance Section */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Appearance
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'dark', label: 'Dark', icon: Moon },
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'system', label: 'System', icon: Monitor },
              ].map((themeOpt) => {
                const Icon = themeOpt.icon;
                const isSelected = settings.theme === themeOpt.id;
                return (
                  <button
                    key={themeOpt.id}
                    onClick={() => onUpdateSettings({ theme: themeOpt.id as any })}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-medium transition ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-surface-850 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{themeOpt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Preferences */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Default Model
              </label>
              <button
                onClick={onRefreshModels}
                className="text-xs text-emerald-500 hover:underline flex items-center gap-1"
              >
                <RotateCw className="w-3 h-3" /> Refresh List
              </button>
            </div>
            <select
              value={settings.defaultModel}
              onChange={(e) => onUpdateSettings({ defaultModel: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface-850 text-slate-800 dark:text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} {m.isClaude ? '(Claude)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Streaming Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-surface-850 border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Response Streaming
                </p>
                <p className="text-[11px] text-slate-500">
                  Stream chunks progressively using Server-Sent Events (SSE).
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.stream}
                onChange={(e) => onUpdateSettings({ stream: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
            </label>
          </div>

          {/* System Prompt */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Custom System Instructions (Optional)
            </label>
            <textarea
              value={settings.systemPrompt}
              onChange={(e) => onUpdateSettings({ systemPrompt: e.target.value })}
              placeholder="e.g. You are a senior software architect with deep expertise in distributed systems..."
              rows={3}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-surface-850 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
            />
          </div>

          {/* Provider Connection Test */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-surface-850 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Radox AI Gateway Status
                </span>
              </div>
              <button
                onClick={handleTestProvider}
                disabled={providerStatus.status === 'checking'}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition disabled:opacity-50"
              >
                {providerStatus.status === 'checking' ? 'Testing...' : 'Test Connection'}
              </button>
            </div>

            {/* Test result feedback */}
            {providerStatus.status === 'connected' && (
              <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>
                  Connected successfully ({providerStatus.latencyMs}ms latency,{' '}
                  {providerStatus.modelCount} models discovered).
                </span>
              </div>
            )}
            {providerStatus.status === 'error' && (
              <div className="flex items-start gap-2 text-xs text-rose-500">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{providerStatus.message}</span>
              </div>
            )}
          </div>

          {/* Clear Storage */}
          <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  Clear Local Conversation History
                </p>
                <p className="text-[11px] text-slate-500">
                  Permanently wipe all chats stored in your browser's IndexedDB.
                </p>
              </div>

              {confirmClear ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleClearHistoryConfirm}
                    className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-600 text-white hover:bg-rose-500 transition"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="px-2.5 py-1 text-xs rounded text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear All
                </button>
              )}
            </div>
          </div>

          {/* Security & Deployment Notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-100 dark:bg-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <p>
              <strong>Security Note:</strong> Your Radox AI API key is safely stored exclusively on
              the backend server environment. Browser storage holds only local chat history and client
              preferences. A shared, publicly deployed instance requires user authentication and per-user
              quotas before being opened to the public.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
