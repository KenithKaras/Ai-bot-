import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  RotateCw,
  Search,
  Check,
  AlertTriangle,
  Zap,
  Eye,
  BrainCircuit,
} from 'lucide-react';
import type { Model } from '../../types/index.js';

interface ModelSelectorProps {
  models: Model[];
  selectedModelId: string;
  selectedModel: Model | null;
  isLoading: boolean;
  error: string | null;
  onSelectModel: (modelId: string) => void;
  onRefresh: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  models = [],
  selectedModelId = '',
  selectedModel = null,
  isLoading = false,
  error = null,
  onSelectModel,
  onRefresh,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const safeModels = Array.isArray(models) ? models : [];
  const filteredModels = safeModels.filter((m) => {
    if (!m || !m.id) return false;
    const q = (search || '').toLowerCase().trim();
    if (!q) return true;
    const idMatch = (m.id || '').toLowerCase().includes(q);
    const nameMatch = (m.name || '').toLowerCase().includes(q);
    return idMatch || nameMatch;
  });

  const displayName = selectedModel?.name || selectedModel?.id || selectedModelId || 'Select Model';
  const isSelectedClaude = Boolean(
    selectedModel?.isClaude || (selectedModelId || '').toLowerCase().includes('claude')
  );
  const isSelectedFast = Boolean(
    (selectedModelId || '').toLowerCase().includes('sonnet') ||
    (selectedModelId || '').toLowerCase().includes('flash') ||
    (selectedModelId || '').toLowerCase().includes('turbo')
  );

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-surface-900 hover:bg-slate-50 dark:hover:bg-surface-850 shadow-sm text-xs font-medium text-slate-800 dark:text-slate-200 transition"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="max-w-[170px] truncate font-mono text-[13px]">{displayName}</span>
        {isSelectedClaude && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            Claude
          </span>
        )}
        {isSelectedFast && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
            <Zap className="w-2.5 h-2.5" /> Fast
          </span>
        )}
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 md:left-0 md:right-auto mt-2 w-80 md:w-96 rounded-2xl bg-white dark:bg-surface-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden flex flex-col max-h-[460px]">
          {/* Header & Refresh */}
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-surface-850 border border-slate-200 dark:border-slate-700/60 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh models from Radox AI"
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Error Message if model discovery fails */}
          {error && (
            <div className="p-3 bg-rose-500/10 border-b border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button
                onClick={onRefresh}
                className="underline font-semibold hover:text-rose-600"
              >
                Retry
              </button>
            </div>
          )}

          {/* Model List */}
          <div className="overflow-y-auto p-1.5 flex-1 divide-y divide-slate-100 dark:divide-slate-800/40">
            {isLoading && safeModels.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Fetching models from Radox AI gateway...
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No matching models found.
              </div>
            ) : (
              filteredModels.map((m) => {
                const isSelected = m.id === selectedModelId;
                const isFast = Boolean(
                  (m.id || '').toLowerCase().includes('sonnet') ||
                  (m.id || '').toLowerCase().includes('flash') ||
                  (m.id || '').toLowerCase().includes('turbo')
                );
                const isOpus = Boolean((m.id || '').toLowerCase().includes('opus'));

                return (
                  <button
                    key={m.id}
                    onClick={() => {
                      onSelectModel(m.id);
                      setIsOpen(false);
                    }}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'hover:bg-slate-100 dark:hover:bg-surface-850 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold truncate">
                          {m.id}
                        </span>
                        {m.isClaude && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            Claude
                          </span>
                        )}
                        {isFast && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                            <Zap className="w-2.5 h-2.5" /> Fast
                          </span>
                        )}
                        {isOpus && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400">
                            Reasoning
                          </span>
                        )}
                      </div>

                      {/* Capabilities badges */}
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400">
                        {m.capabilities?.streaming && (
                          <span className="flex items-center gap-0.5 text-emerald-500">
                            <Zap className="w-2.5 h-2.5" /> Stream
                          </span>
                        )}
                        {m.capabilities?.vision && (
                          <span className="flex items-center gap-0.5 text-blue-400">
                            <Eye className="w-2.5 h-2.5" /> Vision
                          </span>
                        )}
                        {m.capabilities?.reasoning && (
                          <span className="flex items-center gap-0.5 text-purple-400">
                            <BrainCircuit className="w-2.5 h-2.5" /> Reasoner
                          </span>
                        )}
                        {m.ownedBy && (
                          <span className="text-slate-400 font-mono text-[9px] uppercase">
                            {m.ownedBy}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
