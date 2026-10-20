import React, { useState } from 'react';
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Globe,
  Star,
  RefreshCw,
} from 'lucide-react';
import { apiService } from '../../services/api.js';
import type { SafeProvider, ProviderCreateInput, ProviderUpdateInput, Model } from '../../types/index.js';

interface ProviderManagerProps {
  providers: SafeProvider[];
  selectedProviderId: string | null;
  onSelectProvider: (id: string | null) => void;
  onCreateProvider: (data: ProviderCreateInput) => Promise<SafeProvider>;
  onUpdateProvider: (id: string, data: ProviderUpdateInput) => Promise<SafeProvider>;
  onDeleteProvider: (id: string) => Promise<void>;
  onSetDefaultProvider: (id: string) => Promise<void>;
  isAuthenticated: boolean;
  onOpenAuth?: () => void;
}

export const ProviderManager: React.FC<ProviderManagerProps> = ({
  providers,
  selectedProviderId,
  onSelectProvider,
  onCreateProvider,
  onUpdateProvider,
  onDeleteProvider,
  onSetDefaultProvider,
  isAuthenticated,
  onOpenAuth,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [defaultModel, setDefaultModel] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Discovery & Test state
  const [discoveredModels, setDiscoveredModels] = useState<Model[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: 'idle' | 'ok' | 'error';
    latencyMs?: number;
    modelCount?: number;
    message?: string;
  }>({ status: 'idle' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setName('');
    setBaseUrl('');
    setApiKey('');
    setShowKey(false);
    setDefaultModel('');
    setIsDefault(false);
    setDiscoveredModels([]);
    setTestResult({ status: 'idle' });
    setFormError(null);
  };

  const handleStartEdit = (prov: SafeProvider) => {
    setEditingId(prov.id);
    setIsAdding(true);
    setName(prov.name);
    setBaseUrl(prov.baseUrl);
    setApiKey(''); // Leave blank to keep existing key
    setDefaultModel(prov.defaultModel || '');
    setIsDefault(prov.isDefault);
    setDiscoveredModels([]);
    setTestResult({ status: 'idle' });
    setFormError(null);
  };

  const handleTestAndDiscover = async () => {
    if (!baseUrl.trim()) {
      setFormError('Please enter a Base URL.');
      return;
    }
    if (!apiKey.trim() && !editingId) {
      setFormError('Please enter an API key.');
      return;
    }

    setIsTesting(true);
    setFormError(null);
    setTestResult({ status: 'idle' });

    try {
      const result = await apiService.testCustomProvider({
        providerId: editingId && !apiKey.trim() ? editingId : undefined,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
      });

      if (result.status === 'ok') {
        setTestResult({
          status: 'ok',
          latencyMs: result.latencyMs,
          modelCount: result.modelCount,
        });

        // Automatically discover models
        try {
          const models = await apiService.discoverCustomModels({
            providerId: editingId && !apiKey.trim() ? editingId : undefined,
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim() || undefined,
          });
          setDiscoveredModels(models);
          if (models.length > 0 && !defaultModel) {
            setDefaultModel(models[0].id);
          }
        } catch {
          // Model discovery non-fatal if manual entry is available
        }
      } else {
        setTestResult({
          status: 'error',
          message: result.message || 'Connection test failed',
        });
      }
    } catch (err: any) {
      setTestResult({
        status: 'error',
        message: err?.message || 'Could not reach server endpoint',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError('Provider name is required.');
      return;
    }
    if (!baseUrl.trim()) {
      setFormError('Base URL is required.');
      return;
    }
    if (!editingId && !apiKey.trim()) {
      setFormError('API key is required for new providers.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await onUpdateProvider(editingId, {
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim() || undefined,
          defaultModel: defaultModel.trim() || undefined,
          isDefault,
        });
      } else {
        await onCreateProvider({
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          defaultModel: defaultModel.trim() || undefined,
          isDefault,
        });
      }
      resetForm();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save provider.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-surface-850 border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Server className="w-4 h-4 text-emerald-500" />
            <div>
              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Custom AI Gateway Providers
              </h4>
              <p className="text-[11px] text-slate-500">
                Sign in to save and manage encrypted custom gateways (OpenAI, Groq, Together, Radox).
              </p>
            </div>
          </div>
          {onOpenAuth && (
            <button
              onClick={onOpenAuth}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-sm"
            >
              Sign In to Configure
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-surface-850 border border-slate-200/80 dark:border-slate-800 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-500" />
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            AI Provider Gateways
          </h3>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Add Gateway
          </button>
        )}
      </div>

      {/* Provider List */}
      {!isAdding && (
        <div className="space-y-2">
          {providers.length === 0 ? (
            <div className="text-center py-5 border border-dashed border-slate-300 dark:border-slate-700/60 rounded-xl">
              <Globe className="w-6 h-6 mx-auto mb-1 text-slate-400" />
              <p className="text-xs text-slate-500">No custom gateways added yet.</p>
              <p className="text-[11px] text-slate-400">
                Using global server Radox AI gateway by default.
              </p>
            </div>
          ) : (
            providers.map((p) => {
              const isSelected = p.id === selectedProviderId;

              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/5 dark:bg-emerald-950/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-900'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {p.name}
                      </h4>
                      {p.isDefault && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500">
                          <Star className="w-2.5 h-2.5 fill-emerald-500" /> DEFAULT
                        </span>
                      )}
                      {isSelected && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400">
                          ACTIVE
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-mono truncate">
                      <span>{p.baseUrl}</span>
                      <span>•</span>
                      <span className="text-slate-400">{p.keyPreview}</span>
                      {p.defaultModel && (
                        <>
                          <span>•</span>
                          <span className="text-purple-400">{p.defaultModel}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {!isSelected && (
                      <button
                        onClick={() => onSelectProvider(p.id)}
                        className="px-2 py-1 text-[11px] font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-surface-850 text-slate-600 dark:text-slate-300 transition"
                        title="Use this gateway for chat"
                      >
                        Select
                      </button>
                    )}
                    {!p.isDefault && (
                      <button
                        onClick={() => onSetDefaultProvider(p.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-surface-850 text-slate-400 hover:text-emerald-500 transition"
                        title="Make default gateway"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleStartEdit(p)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-surface-850 text-slate-400 hover:text-slate-200 transition"
                      title="Edit gateway"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {deleteConfirmId === p.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={async () => {
                            await onDeleteProvider(p.id);
                            setDeleteConfirmId(null);
                          }}
                          className="px-2 py-1 text-[10px] font-bold rounded bg-rose-600 text-white"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-1.5 py-1 text-[10px] text-slate-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(p.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-400 hover:text-rose-500 transition"
                        title="Delete gateway"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Add / Edit Form */}
      {isAdding && (
        <form onSubmit={handleSave} className="space-y-3.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
              {editingId ? 'Edit AI Gateway Provider' : 'Add New AI Gateway Provider'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>

          {formError && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Provider Name */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Provider Name / Label
            </label>
            <input
              type="text"
              required
              placeholder="e.g. My Radox Gateway, OpenAI, Groq"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              API Base URL (OpenAI-compatible)
            </label>
            <input
              type="url"
              required
              placeholder="https://radoxai.com/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono rounded-xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              API Key {editingId && <span className="text-slate-400 font-normal">(leave blank to keep current)</span>}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                placeholder={editingId ? '••••••••••••••••' : 'cc_... or sk-...'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full pl-3 pr-8 py-1.5 text-xs font-mono rounded-xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              🔒 Encrypted at rest via AES-256-GCM. Never logged or exposed to client JavaScript.
            </p>
          </div>

          {/* Test & Discover Button */}
          <div className="pt-1">
            <button
              type="button"
              disabled={isTesting || !baseUrl.trim()}
              onClick={handleTestAndDiscover}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 text-xs font-semibold transition disabled:opacity-50"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Test Connection & Fetch Models</span>
            </button>

            {testResult.status === 'ok' && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium mt-2">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  Connected successfully ({testResult.latencyMs}ms latency,{' '}
                  {testResult.modelCount} models discovered).
                </span>
              </div>
            )}
            {testResult.status === 'error' && (
              <div className="flex items-start gap-1.5 text-xs text-rose-500 mt-2">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Default Model Selector */}
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Default Model
            </label>
            {discoveredModels.length > 0 ? (
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono rounded-xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {discoveredModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} {m.isClaude ? '(Claude)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="e.g. claude-sonnet-5, gpt-4o, llama-3.3-70b"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono rounded-xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              Select from discovered models or type custom model ID supported by the endpoint.
            </p>
          </div>

          {/* Set as Default Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isDefaultGateway"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="isDefaultGateway" className="text-xs text-slate-700 dark:text-slate-300">
              Set as my default gateway for new chats
            </label>
          </div>

          {/* Form Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : editingId ? 'Update Gateway' : 'Save Gateway'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
