import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  language?: string;
  value: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy code to clipboard', e);
    }
  };

  const displayLanguage = language || 'text';

  return (
    <div className="relative my-3 rounded-lg overflow-hidden border border-slate-700/60 bg-slate-900/90 shadow-sm text-sm font-mono">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-800/80 border-b border-slate-700/60 text-xs text-slate-300">
        <span className="font-semibold uppercase tracking-wider text-slate-400">
          {displayLanguage}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-700/60 transition text-slate-300 hover:text-white"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <div className="p-4 overflow-x-auto text-slate-100 font-mono text-[13px] leading-relaxed selection:bg-slate-700">
        <pre className="m-0">
          <code>{value}</code>
        </pre>
      </div>
    </div>
  );
};
