import type { ReactNode } from "react";

interface Param {
  name: string;
  type: string;
  required?: boolean;
  default?: string;
  description: ReactNode;
}

interface ParamTableProps {
  params: Param[];
  /** If true, show an empty-state row when no params */
  emptyMessage?: string;
}

/**
 * ParamTable — the canonical parameter table used by every endpoint card.
 * Renders name / type / required / default / description columns.
 */
export function ParamTable({ params, emptyMessage }: ParamTableProps) {
  if (params.length === 0) {
    return (
      <div className="my-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
        {emptyMessage || "No parameters — just hit the endpoint."}
      </div>
    );
  }
  return (
    <div className="my-3 overflow-hidden rounded-lg border border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            <th className="px-4 py-2.5 font-medium">Parameter</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Required</th>
            <th className="px-4 py-2.5 font-medium">Default</th>
            <th className="px-4 py-2.5 font-medium">Description</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {params.map((p) => (
            <tr key={p.name} className="text-zinc-300">
              <td className="px-4 py-2.5">
                <code className="font-mono text-emerald-400">{p.name}</code>
              </td>
              <td className="px-4 py-2.5">
                <span className="font-mono text-xs text-sky-300">{p.type}</span>
              </td>
              <td className="px-4 py-2.5">
                {p.required ? (
                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-xs text-rose-400">
                    required
                  </span>
                ) : (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                    optional
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {p.default ? (
                  <code className="font-mono text-xs text-zinc-400">{p.default}</code>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-zinc-400">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
