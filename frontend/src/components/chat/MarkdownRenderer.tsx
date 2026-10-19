import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock.js';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="prose dark:prose-invert max-w-none text-slate-900 dark:text-slate-100 leading-relaxed text-[15px] break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-radox-600 dark:text-emerald-400 font-mono text-[13px]"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <CodeBlock
                language={match ? match[1] : undefined}
                value={String(children).replace(/\n$/, '')}
              />
            );
          },
          a({ href, children }) {
            // Prevent dangerous javascript: or data: URIs
            const isSafe = href && !href.toLowerCase().startsWith('javascript:') && !href.toLowerCase().startsWith('data:');
            return (
              <a
                href={isSafe ? href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-500 hover:text-emerald-400 underline underline-offset-2 transition font-medium"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3 border border-slate-300 dark:border-slate-700/60 rounded-lg">
                <table className="w-full text-left text-sm">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800/90 font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-300 dark:border-slate-700">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                {children}
              </td>
            );
          },
          ul({ children }) {
            return <ul className="list-disc pl-5 my-2.5 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 my-2.5 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="text-slate-800 dark:text-slate-200">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-emerald-500/80 pl-4 py-1 my-2.5 text-slate-600 dark:text-slate-400 italic bg-slate-100/50 dark:bg-slate-800/30 rounded-r">
                {children}
              </blockquote>
            );
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0">{children}</p>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
