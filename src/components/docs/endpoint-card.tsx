import type { ReactNode } from "react";

interface EndpointCardProps {
  id: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  path: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}

/**
 * EndpointCard — wraps a single endpoint's full documentation block.
 * Renders the method/path header bar, then children (params, examples, etc.).
 */
export function EndpointCard({
  id,
  method,
  path,
  title,
  description,
  children,
}: EndpointCardProps) {
  const methodColor: Record<string, string> = {
    GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    POST: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    PUT: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    DELETE: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    HEAD: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };

  return (
    <section id={id} className="scroll-mt-20 py-8">
      <h3 className="mb-1 text-lg font-semibold text-zinc-100">{title}</h3>
      <p className="mb-4 text-sm text-zinc-400">{description}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <span
          className={`rounded-md border px-2 py-0.5 font-mono text-xs font-bold ${methodColor[method]}`}
        >
          {method}
        </span>
        <code className="font-mono text-sm text-zinc-200 break-all">{path}</code>
      </div>

      {children}
    </section>
  );
}
