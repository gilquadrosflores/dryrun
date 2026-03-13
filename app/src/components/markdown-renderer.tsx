"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold mb-4 mt-6 text-zinc-100">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold mb-3 mt-5 text-zinc-100">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-medium mb-2 mt-4 text-zinc-200">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-sm text-zinc-300 mb-3 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside text-sm text-zinc-300 mb-3 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside text-sm text-zinc-300 mb-3 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-zinc-300">{children}</li>
          ),
          strong: ({ children }) => (
            <strong className="text-zinc-100 font-semibold">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="text-zinc-400 italic">{children}</em>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border border-zinc-800 rounded">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-zinc-800/50">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-zinc-800">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="border-b border-zinc-800">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="text-left p-2 text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="p-2 text-sm text-zinc-300">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-zinc-600 pl-4 my-3 text-zinc-400 italic">
              {children}
            </blockquote>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded text-xs font-mono">
                  {children}
                </code>
              );
            }
            return (
              <pre className="bg-zinc-900 border border-zinc-800 rounded p-3 mb-3 overflow-x-auto">
                <code className="text-sm text-zinc-300 font-mono">{children}</code>
              </pre>
            );
          },
          hr: () => <hr className="border-zinc-800 my-4" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
