"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`prose-sm max-w-none text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-base font-bold mt-3 mb-1.5 text-zinc-900 dark:text-white">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold mt-3 mb-1 text-zinc-900 dark:text-white">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold uppercase tracking-wider mt-2.5 mb-1 text-emerald-600 dark:text-emerald-400">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-2 last:mb-0 leading-relaxed text-zinc-800 dark:text-slate-200">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-zinc-950 dark:text-white">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-zinc-700 dark:text-slate-300">
              {children}
            </em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 text-zinc-800 dark:text-slate-200">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 text-zinc-800 dark:text-slate-200">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-emerald-500 pl-3 italic text-zinc-600 dark:text-slate-400 my-2">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }) => {
            const isInline = !className && typeof children === "string" && !children.includes("\n");
            if (isInline) {
              return (
                <code
                  className="bg-zinc-100 dark:bg-slate-800/80 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[12px] font-mono border border-zinc-200/60 dark:border-slate-700/50"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-zinc-950 text-slate-200 p-3 rounded-xl overflow-x-auto text-xs font-mono my-2 border border-zinc-800">
                <code {...props}>{children}</code>
              </pre>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-zinc-200 dark:border-slate-800">
              <table className="min-w-full divide-y divide-zinc-200 dark:divide-slate-800 text-xs">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-zinc-50 dark:bg-slate-900 text-zinc-700 dark:text-slate-300 font-semibold">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-t border-zinc-100 dark:border-slate-800/60 text-zinc-700 dark:text-slate-300">
              {children}
            </td>
          ),
          hr: () => <hr className="my-3 border-zinc-200 dark:border-slate-800" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
