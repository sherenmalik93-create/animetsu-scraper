"use client";

import { useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  /** Show a tab label above the code block (e.g. "Response", "curl") */
  label?: string;
  className?: string;
}

/**
 * CodeBlock — a copy-to-clipboard code viewer used throughout the API docs.
 *
 * Why a client component: clipboard access requires the browser. We keep the
 * rendering simple (no syntax highlighter dependency) and rely on a monospace
 * font + subtle token coloring via CSS classes for readability.
 */
export function CodeBlock({
  code,
  language = "bash",
  filename,
  label,
  className = "",
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [code]);

  return (
    <div className={`group relative my-3 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 ${className}`}>
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
          {filename && (
            <span className="font-mono text-zinc-300">{filename}</span>
          )}
          {label && !filename && <span>{label}</span>}
          {language && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
              {language}
            </span>
          )}
        </div>
        <button
          onClick={onCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono text-zinc-200">{code}</code>
      </pre>
    </div>
  );
}
