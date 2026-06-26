"use client";

import { useState, type ReactNode } from "react";

interface CodeTabsProps {
  tabs: Array<{ label: string; language?: string; code: string }>;
  /** Optional description shown above the tabs */
  description?: ReactNode;
}

/**
 * CodeTabs — a tabbed code viewer for showing the same request in multiple
 * languages (curl / JavaScript / Python). Used by every endpoint card.
 */
export function CodeTabs({ tabs, description }: CodeTabsProps) {
  const [active, setActive] = useState(0);
  const tab = tabs[active];

  return (
    <div className="my-3">
      {description && (
        <p className="mb-2 text-xs text-zinc-500">{description}</p>
      )}
      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <div className="flex border-b border-zinc-800 bg-zinc-900/60">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setActive(i)}
              className={`relative px-4 py-2 text-xs font-medium transition-colors ${
                active === i
                  ? "text-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t.label}
              {active === i && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-400" />
              )}
            </button>
          ))}
        </div>
        <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
          <code className="font-mono text-zinc-200">{tab.code}</code>
        </pre>
      </div>
    </div>
  );
}
