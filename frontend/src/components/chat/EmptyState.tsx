import React from 'react';
import { Sparkles, Terminal, Code2, Cpu, ArrowUpRight, Zap, Server, Settings } from 'lucide-react';
import type { Model } from '../../types/index.js';

interface EmptyStateProps {
  selectedModel: Model | null;
  selectedModelId: string;
  onSelectPrompt: (prompt: string) => void;
  hasProviders?: boolean;
  onOpenSettings?: () => void;
}

const STARTER_PROMPTS = [
  {
    title: 'Architect a Microservice',
    desc: 'Design a resilient event-driven architecture using TypeScript and Kafka.',
    icon: Cpu,
    prompt: 'Can you help me design a resilient event-driven microservices architecture in Node.js/TypeScript? Outline service boundaries, communication patterns, and error handling.',
  },
  {
    title: 'Code Refactoring & Optimization',
    desc: 'Refactor complex React hooks for performance and clean separation.',
    icon: Code2,
    prompt: 'What are the best practices for structuring custom React hooks in a high-traffic dashboard application to minimize unnecessary re-renders?',
  },
  {
    title: 'Debug an Async Pipeline',
    desc: 'Explain backpressure, SSE buffering, and socket lifecycle handling.',
    icon: Terminal,
    prompt: 'Explain how Server-Sent Events (SSE) should be properly configured in Express and Nginx to avoid proxy buffering issues.',
  },
  {
    title: 'Deep System Analysis',
    desc: 'Explore tradeoffs between PostgreSQL schemas and document stores.',
    icon: Sparkles,
    prompt: 'Compare relational models in PostgreSQL versus document stores for a high-concurrency conversational AI platform.',
  },
];

export const EmptyState: React.FC<EmptyStateProps> = ({
  selectedModel,
  selectedModelId,
  onSelectPrompt,
  hasProviders = true,
  onOpenSettings,
}) => {
  const isOpus = Boolean(selectedModelId && selectedModelId.toLowerCase().includes('opus'));

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 max-w-2xl mx-auto w-full select-none">
      {/* Provider Notice if no gateway configured */}
      {!hasProviders && (
        <div className="w-full mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 flex-shrink-0 mt-0.5 sm:mt-0">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-xs text-white">No AI Gateway Configured</h3>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                Connect your OpenAI, Anthropic, OpenRouter, or custom provider API in Settings to enable chat models.
              </p>
            </div>
          </div>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex-shrink-0 self-end sm:self-auto px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition shadow-sm flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Configure Provider</span>
            </button>
          )}
        </div>
      )}

      {/* Brand Icon Header */}
      <div className="flex flex-col items-center text-center mb-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/15 mb-4 transform hover:scale-105 transition-transform duration-300">
          <Sparkles className="w-7 h-7 text-white" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Radox AI Studio
        </h1>

        <div className="mt-2.5 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-surface-850 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Connected to</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
            {selectedModel?.name || selectedModelId}
          </span>
          {isOpus && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-medium">
              Deep Reasoning (Slower)
            </span>
          )}
          {!isOpus && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" /> Fast
            </span>
          )}
        </div>
      </div>

      {/* Starter Prompts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
        {STARTER_PROMPTS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              onClick={() => onSelectPrompt(item.prompt)}
              className="group p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-surface-900 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 hover:bg-emerald-50/20 dark:hover:bg-surface-850 hover:shadow-md transition-all duration-200 flex flex-col justify-between text-left shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-surface-800 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-200">
                    <Icon className="w-4 h-4" />
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                  {item.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">
                  {item.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
