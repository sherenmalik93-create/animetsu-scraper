import Link from "next/link";
import { EndpointCard } from "@/components/docs/endpoint-card";
import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/code-tabs";
import { ParamTable } from "@/components/docs/param-table";

export const metadata = {
  title: "ID Finder Docs — Animetsu Scraper",
  description:
    "Documentation for the Anime ID Finder tool: resolve any AniList ID to a provider-native id across all 7 providers (animetsu, anikuro, animeyubi, miruro, animex, anilight, anipm). Single-provider and all-providers modes.",
};

const SIDEBAR_SECTIONS = [
  {
    title: "ID Finder",
    items: [
      { id: "overview", label: "Overview" },
      { id: "ui", label: "UI Tool" },
      { id: "why", label: "Why Use It" },
      { id: "id-formats", label: "Provider ID Formats" },
    ],
  },
  {
    title: "Endpoints",
    items: [
      { id: "find-id", label: "Find ID (universal)" },
      { id: "find-id-all", label: "Find ID (all providers)" },
      { id: "animetsu-id", label: "Animetsu ID (legacy)" },
      { id: "resolve", label: "Resolve (low-level)" },
    ],
  },
  {
    title: "Reference",
    items: [
      { id: "strategies", label: "Resolution Strategies" },
      { id: "examples", label: "Example IDs" },
      { id: "errors", label: "Errors" },
    ],
  },
];

export default function IdFinderDocsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-zinc-200 hover:text-white"
            >
              <span className="text-lg">◆</span>
              <span className="font-semibold">Animetsu Scraper</span>
            </Link>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
              ID Finder Docs
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/docs"
              className="text-zinc-400 transition-colors hover:text-zinc-200"
            >
              ← Main Docs
            </Link>
            <Link
              href="/animetsu-id"
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Open Tool →
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-zinc-800 bg-gradient-to-b from-emerald-500/10 to-transparent">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Tool Docs · v1.4.0
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Anime ID Finder
          </h1>
          <p className="max-w-3xl text-lg text-zinc-400">
            Resolve any AniList ID to a provider-native id across all 7
            providers. Single-provider mode returns the native id + ready-to-use{" "}
            <code className="font-mono text-emerald-400">/sources</code> URL.
            All-providers mode resolves across every provider in parallel and
            tells you which ones have the anime — useful for fallback chains
            and availability checks.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <StatCard label="Providers" value="7" sub="animetsu · anikuro · animeyubi · miruro · animex · anilight · anipm" />
            <StatCard label="Modes" value="2" sub="Single provider · All providers" />
            <StatCard label="Cache TTL" value="30 min" sub="In-memory per provider+anilist" />
            <StatCard label="Cold lookup" value="~2-3s" sub="Per provider (parallel in all-mode)" />
          </div>
        </div>
      </section>

      {/* Main layout */}
      <div className="mx-auto flex max-w-7xl gap-12 px-6 py-10">
        <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-64 shrink-0 overflow-y-auto lg:block">
          <nav className="space-y-6">
            {SIDEBAR_SECTIONS.map((section) => (
              <div key={section.title}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {section.title}
                </h4>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="block rounded-md px-2 py-1 text-sm text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 divide-y divide-zinc-800">
          {/* ---------------------------------------------------------------- */}
          {/* OVERVIEW                                                          */}
          {/* ---------------------------------------------------------------- */}
          <section id="overview" className="scroll-mt-20 pb-2">
            <h2 className="mb-3 text-2xl font-bold text-white">Overview</h2>
            <p className="mb-4 text-zinc-400">
              Every provider in this scraper has its own native id format —
              animetsu uses 24-char Mongo ObjectIds, anikuro uses numerics,
              anipm uses a composite{" "}
              <code className="font-mono text-zinc-400">anipm:{"{id}"}:{"{slug}"}</code>,
              miruro/animex/anilight use AniList IDs natively. End-users never
              know these — but they DO know the AniList id (visible in every
              anilist.co URL).
            </p>
            <p className="mb-4 text-zinc-400">
              The ID Finder bridges that gap. Pass an AniList ID and (optionally)
              a provider, get back the native id, the universal id, and a
              ready-to-use <code className="font-mono text-zinc-400">/sources</code>{" "}
              URL. Useful for debugging, caching, building fallback chains, or
              passing the native id to a non-API consumer.
            </p>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
              <strong className="font-semibold">Important:</strong> You do not
              need this tool to use the API. Every endpoint already accepts
              the universal id <code className="font-mono">al:{"{anilistId}"}</code> and
              resolves it automatically. This tool exists for when you want
              to see the underlying native id explicitly.
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* UI TOOL                                                           */}
          {/* ---------------------------------------------------------------- */}
          <section id="ui" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">UI Tool</h2>
            <p className="mb-4 text-zinc-400">
              The interactive UI lives at{" "}
              <Link href="/animetsu-id" className="text-emerald-400 hover:underline">
                /animetsu-id
              </Link>{" "}
              (URL kept for backwards compatibility — the page itself is now
              the universal &quot;Anime ID Finder&quot;). Features:
            </p>
            <ul className="mb-4 space-y-2 text-sm text-zinc-400 list-disc pl-6">
              <li>Single input box — paste AniList ID or full anilist.co URL.</li>
              <li>Provider dropdown — pick one of 7 providers, or &quot;All Providers&quot;.</li>
              <li>
                Single-provider mode: shows cover image, matched title, native
                id (with copy button), universal id, ready-to-use{" "}
                <code className="font-mono">/sources</code> URL, resolution
                trace, and quick-jump buttons to /sources, /info, /episodes.
              </li>
              <li>
                All-providers mode: shows a per-provider breakdown with
                availability badges, native ids, and direct links. Includes
                a &quot;best provider&quot; hint (first provider that resolved
                in priority order).
              </li>
              <li>
                6 popular AniList IDs as one-click examples (Frieren, One
                Piece, FMA: Brotherhood, JJK, Solo Leveling, AoT).
              </li>
            </ul>
            <CodeBlock
              language="text"
              label="URL"
              code={`https://your-deployment.example.com/animetsu-id`}
            />
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* WHY USE IT                                                        */}
          {/* ---------------------------------------------------------------- */}
          <section id="why" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Why Use It</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <UseCase
                title="Debug failed resolution"
                body="When al:{anilistId} doesn't resolve on a provider, /find-id returns the list of titles that were tried. You can see exactly why it failed — maybe the provider lists it under a synonym you didn't expect."
              />
              <UseCase
                title="Cache native ids client-side"
                body="If you're hitting /sources many times for the same anime, call /find-id once, cache the native id, and pass it directly to /sources on subsequent calls. Skips the resolution overhead."
              />
              <UseCase
                title="Build provider fallback chains"
                body="All-providers mode tells you which providers have a given anime. Use this to build a 'try animetsu, fall back to anipm, fall back to miruro' chain in your client."
              />
              <UseCase
                title="Pass native id to external tools"
                body="If you have a script or tool that doesn't speak the universal al:{id} format, /find-id gives you the raw native id to pass directly."
              />
              <UseCase
                title="Inspect provider coverage"
                body="All-providers mode shows you exactly which providers have each anime. Useful for analytics: 'what % of my catalog is on animetsu vs anipm?'"
              />
              <UseCase
                title="Show users the underlying id"
                body="For transparency — let users see the actual animetsu Mongo ObjectId or anipm series id, not just the universal form. Builds trust."
              />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* PROVIDER ID FORMATS                                                */}
          {/* ---------------------------------------------------------------- */}
          <section id="id-formats" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">
              Provider ID Formats
            </h2>
            <p className="mb-4 text-zinc-400">
              Every provider has its own native id format. The table below shows
              what each one looks like, whether it accepts the universal{" "}
              <code className="font-mono text-zinc-400">al:{"{anilistId}"}</code>{" "}
              format natively, and an example native id for Frieren (AniList ID{" "}
              <code className="font-mono text-emerald-400">154587</code>).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Provider</th>
                    <th className="py-2 pr-4 font-medium">Native ID format</th>
                    <th className="py-2 pr-4 font-medium">Accepts al:{"{id}"} natively?</th>
                    <th className="py-2 font-medium">Example (Frieren)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  <tr>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-zinc-200">animetsu</span>
                      <span className="ml-2 text-xs text-zinc-500">Animetsu</span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-400">24-char Mongo ObjectId</td>
                    <td className="py-2 pr-4 text-zinc-500">No — title-search</td>
                    <td className="py-2 font-mono text-xs text-emerald-400">6989b8a029cf95f4eb03b500</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-zinc-200">anikuro</span>
                      <span className="ml-2 text-xs text-zinc-500">Anikuro</span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-400">numeric string</td>
                    <td className="py-2 pr-4 text-zinc-500">No — title-search</td>
                    <td className="py-2 font-mono text-xs text-emerald-400">4231</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-zinc-200">animeyubi</span>
                      <span className="ml-2 text-xs text-zinc-500">Animeyubi</span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-400">numeric string</td>
                    <td className="py-2 pr-4 text-zinc-500">No — title-search</td>
                    <td className="py-2 font-mono text-xs text-emerald-400">9821</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-zinc-200">miruro</span>
                      <span className="ml-2 text-xs text-zinc-500">Miruro</span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-400">al:{"{anilistId}"}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-400">YES — passthrough</span>
                    </td>
                    <td className="py-2 font-mono text-xs text-emerald-400">al:154587</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-zinc-200">animex</span>
                      <span className="ml-2 text-xs text-zinc-500">Animex</span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-400">al:{"{anilistId}"}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-400">YES — passthrough</span>
                    </td>
                    <td className="py-2 font-mono text-xs text-emerald-400">al:154587</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-zinc-200">anilight</span>
                      <span className="ml-2 text-xs text-zinc-500">Anilight</span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-400">al:{"{anilistId}"}:{"{slug}"}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-400">YES — passthrough</span>
                    </td>
                    <td className="py-2 font-mono text-xs text-emerald-400">al:154587:sousou-no-frieren</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-zinc-200">anipm</span>
                      <span className="ml-2 text-xs text-zinc-500">Ani.pm</span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-zinc-400">anipm:{"{seriesId}"}:{"{slug}"}</td>
                    <td className="py-2 pr-4 text-zinc-500">No — title-search</td>
                    <td className="py-2 font-mono text-xs text-emerald-400">anipm:6351:frieren-beyond-journey-s-end-c6fbj</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-200">
              <strong className="font-semibold">Universal ID:</strong>{" "}
              Regardless of the provider&apos;s native format, every endpoint
              accepts <code className="font-mono">al:{"{anilistId}"}</code> as a
              universal id. The backend resolves it to the provider&apos;s native
              format automatically (with a 30-min in-memory cache). You only
              need this tool if you want to see the native id explicitly.
            </div>
            <p className="mt-3 text-sm text-zinc-500">
              For per-provider deep dives, see the{" "}
              <Link href="/docs/anipm" className="text-emerald-400 hover:underline">
                Ani.pm provider docs
              </Link>{" "}
              (other per-provider docs coming soon).
            </p>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* ENDPOINT: find-id (single)                                        */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="find-id"
            method="GET"
            path="/api/scrape/find-id?anilist={anilistId}&provider={providerId}"
            title="Find ID (single provider)"
            description="Resolves an AniList ID to the native id for a specific provider. Returns the native id, universal id, ready-to-use /sources URLs, and the full resolution trace (which title matched, which titles were tried, what strategy was used)."
          >
            <ParamTable
              params={[
                {
                  name: "anilist",
                  type: "number",
                  required: true,
                  description: "AniList ID (e.g. 154587 for Frieren).",
                },
                {
                  name: "provider",
                  type: "enum",
                  required: true,
                  description: "One of: animetsu, anikuro, animeyubi, miruro, animex, anilight, anipm. Omit for all-providers mode (see next endpoint).",
                },
              ]}
            />
            <CodeTabs
              tabs={[
                { label: "animetsu", code: `curl ".../api/scrape/find-id?anilist=154587&provider=animetsu"` },
                { label: "anipm",    code: `curl ".../api/scrape/find-id?anilist=154587&provider=anipm"` },
                { label: "miruro",   code: `curl ".../api/scrape/find-id?anilist=154587&provider=miruro"` },
              ]}
            />
            <CodeBlock
              language="json"
              label="200 OK (animetsu)"
              code={`{
  "anilistId": 154587,
  "provider": "animetsu",
  "anilist": {
    "id": 154587,
    "idMal": 52991,
    "title": {
      "romaji": "Sousou no Frieren",
      "english": "Frieren: Beyond Journey's End",
      "native": "葬送のフリーレン"
    },
    "coverImage": { "large": "https://s4.anilist.co/..." },
    "seasonYear": 2023,
    "format": "TV"
  },
  "resolved": {
    "nativeId": "6989b8a029cf95f4eb03b500",
    "anilistId": 154587,
    "provider": "animetsu",
    "matchedTitle": "Frieren: Beyond Journey's End",
    "strategy": "title-search",
    "triedTitles": [
      "Frieren: Beyond Journey's End",
      "Sousou no Frieren",
      "葬送のフリーレン"
    ]
  },
  "nativeId": "6989b8a029cf95f4eb03b500",
  "universalId": "al:154587",
  "sourcesUrl": "/api/scrape/sources?id=6989b8a029cf95f4eb03b500&provider=animetsu&ep=1",
  "universalSourcesUrl": "/api/scrape/sources?id=al%3A154587&provider=animetsu&ep=1"
}`}
            />
            <CodeBlock
              language="json"
              label="200 OK (anipm)"
              code={`{
  "anilistId": 154587,
  "provider": "anipm",
  "resolved": {
    "nativeId": "anipm:6351:frieren-beyond-journey-end",
    "anilistId": 154587,
    "provider": "anipm",
    "matchedTitle": "Frieren: Beyond Journey's End",
    "strategy": "title-search"
  },
  "nativeId": "anipm:6351:frieren-beyond-journey-end",
  "universalId": "al:154587",
  "sourcesUrl": "/api/scrape/sources?id=anipm%3A6351%3Afrieren-beyond-journey-end&provider=anipm&ep=1",
  "universalSourcesUrl": "/api/scrape/sources?id=al%3A154587&provider=anipm&ep=1"
}`}
            />
            <CodeBlock
              language="json"
              label="200 OK (miruro — AniList-native, passthrough)"
              code={`{
  "anilistId": 154587,
  "provider": "miruro",
  "resolved": {
    "nativeId": "al:154587",
    "anilistId": 154587,
    "provider": "miruro",
    "strategy": "passthrough"
  },
  "nativeId": "al:154587",
  "universalId": "al:154587",
  "sourcesUrl": "/api/scrape/sources?id=al%3A154587&provider=miruro&ep=1",
  "universalSourcesUrl": "/api/scrape/sources?id=al%3A154587&provider=miruro&ep=1"
}`}
            />
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* ENDPOINT: find-id (all)                                           */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="find-id-all"
            method="GET"
            path="/api/scrape/find-id?anilist={anilistId}"
            title="Find ID (all providers)"
            description="Resolves an AniList ID across ALL providers in parallel. Returns a per-provider breakdown showing which providers have the anime, each provider's native id + /sources URL, and a 'best provider' hint (first that resolved in priority order). Use this for fallback chains and availability checks."
          >
            <ParamTable
              params={[
                {
                  name: "anilist",
                  type: "number",
                  required: true,
                  description: "AniList ID.",
                },
              ]}
            />
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl "https://your-deployment.example.com/api/scrape/find-id?anilist=154587"`}
            />
            <CodeBlock
              language="json"
              label="200 OK (truncated)"
              code={`{
  "anilistId": 154587,
  "anilist": {
    "id": 154587,
    "title": {
      "english": "Frieren: Beyond Journey's End",
      "romaji": "Sousou no Frieren"
    },
    "coverImage": { "large": "https://s4.anilist.co/..." },
    "seasonYear": 2023,
    "format": "TV"
  },
  "providers": {
    "animetsu": {
      "resolved": { "nativeId": "6989b8a029cf95f4eb03b500", "strategy": "title-search", ... },
      "nativeId": "6989b8a029cf95f4eb03b500",
      "universalId": "al:154587",
      "sourcesUrl": "/api/scrape/sources?id=6989b8a029cf95f4eb03b500&provider=animetsu&ep=1",
      "universalSourcesUrl": "/api/scrape/sources?id=al%3A154587&provider=animetsu&ep=1",
      "label": "Animetsu"
    },
    "anikuro":  { "nativeId": "4231", "label": "Anikuro", ... },
    "animeyubi":{ "nativeId": "9821", "label": "Animeyubi", ... },
    "miruro":   { "nativeId": "al:154587", "strategy": "passthrough", "label": "Miruro", ... },
    "animex":   { "nativeId": "al:154587", "strategy": "passthrough", "label": "Animex", ... },
    "anilight": { "nativeId": "al:154587:sousou-no-frieren", "label": "Anilight", ... },
    "anipm":    { "nativeId": "anipm:6351:frieren-beyond-journey-end", "label": "Ani.pm", ... }
  },
  "availableCount": 7,
  "bestProvider": "animetsu",
  "universalId": "al:154587"
}`}
            />
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              <strong className="text-zinc-200">Provider priority order:</strong>{" "}
              animetsu → anikuro → animeyubi → miruro → animex → anilight →
              anipm. <code className="font-mono text-zinc-400">bestProvider</code> is
              the first one that resolved — useful as a default for fallback
              chains. Providers that don&apos;t have the anime return{" "}
              <code className="font-mono text-zinc-400">null</code> in the
              providers map.
            </div>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* ENDPOINT: animetsu-id (legacy)                                    */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="animetsu-id"
            method="GET"
            path="/api/scrape/animetsu-id?anilist={anilistId}"
            title="Animetsu ID Finding (legacy)"
            description="The original animetsu-only resolver. Kept for backwards compatibility — prefer /api/scrape/find-id?provider=animetsu for new code. Same response shape, just scoped to animetsu."
          >
            <CodeBlock
              language="bash"
              label="Equivalent calls"
              code={`# Legacy (still works)
curl ".../api/scrape/animetsu-id?anilist=154587"

# New (preferred)
curl ".../api/scrape/find-id?anilist=154587&provider=animetsu"`}
            />
            <p className="mt-3 text-sm text-zinc-500">
              The legacy endpoint returns <code className="font-mono text-zinc-400">animetsuId</code> instead of <code className="font-mono text-zinc-400">nativeId</code> — otherwise identical.
            </p>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* ENDPOINT: resolve                                                 */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="resolve"
            method="GET"
            path="/api/scrape/resolve?anilist={anilistId}&provider={providerId}"
            title="Resolve (low-level)"
            description="The low-level resolver that /find-id wraps. Returns a ResolveResult object without the AniList metadata or pre-built /sources URLs. Useful when you want minimal overhead and don't need the extras."
          >
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl ".../api/scrape/resolve?anilist=154587&provider=animetsu"`}
            />
            <p className="mt-3 text-sm text-zinc-500">
              See the{" "}
              <Link href="/docs#resolve" className="text-emerald-400 hover:underline">
                main docs
              </Link>{" "}
              for the full response schema.
            </p>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* STRATEGIES                                                        */}
          {/* ---------------------------------------------------------------- */}
          <section id="strategies" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Resolution Strategies</h2>
            <p className="mb-4 text-zinc-400">
              The <code className="font-mono text-zinc-400">strategy</code> field
              in the response tells you how the native id was resolved. Three
              values:
            </p>
            <div className="space-y-3">
              <StrategyCard
                name="passthrough"
                color="emerald"
                body="The provider natively accepts al:{anilistId} as its id format — no resolution needed. miruro, animex, and anilight all use AniList IDs as their primary key. Zero overhead."
              />
              <StrategyCard
                name="title-search"
                color="amber"
                body="The backend fetched the AniList media, collected candidate titles (english, romaji, native, synonyms), searched the provider's catalog with each in priority order, and picked the first hit. Takes 1-3s on cold cache."
              />
              <StrategyCard
                name="cache-hit"
                color="sky"
                body="Resolution was served from the in-memory 30-min cache. Subsequent calls on the same provider+anilist combo are instant. The cache is per-process — restarts clear it."
              />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* EXAMPLES                                                          */}
          {/* ---------------------------------------------------------------- */}
          <section id="examples" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Example AniList IDs</h2>
            <p className="mb-4 text-zinc-400">
              Popular anime to test with. The AniList ID is the number in any{" "}
              <a
                href="https://anilist.co/search/anime"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline"
              >
                anilist.co/anime/&lt;id&gt;
              </a>{" "}
              URL.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="py-2 pr-4 font-medium">AniList ID</th>
                    <th className="py-2 pr-4 font-medium">Title</th>
                    <th className="py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  <tr><td className="py-2 pr-4 font-mono text-emerald-400">154587</td><td className="py-2 pr-4">Frieren: Beyond Journey&apos;s End</td><td className="py-2 text-zinc-500">2023 · 28 eps · sub+dub</td></tr>
                  <tr><td className="py-2 pr-4 font-mono text-emerald-400">21</td><td className="py-2 pr-4">One Piece</td><td className="py-2 text-zinc-500">1999 · 1100+ eps</td></tr>
                  <tr><td className="py-2 pr-4 font-mono text-emerald-400">5114</td><td className="py-2 pr-4">Fullmetal Alchemist: Brotherhood</td><td className="py-2 text-zinc-500">2009 · 64 eps</td></tr>
                  <tr><td className="py-2 pr-4 font-mono text-emerald-400">101922</td><td className="py-2 pr-4">Jujutsu Kaisen</td><td className="py-2 text-zinc-500">2020 · 24 eps</td></tr>
                  <tr><td className="py-2 pr-4 font-mono text-emerald-400">113415</td><td className="py-2 pr-4">Solo Leveling</td><td className="py-2 text-zinc-500">2024 · 12 eps</td></tr>
                  <tr><td className="py-2 pr-4 font-mono text-emerald-400">16498</td><td className="py-2 pr-4">Attack on Titan</td><td className="py-2 text-zinc-500">2013 · 25 eps</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* ERRORS                                                            */}
          {/* ---------------------------------------------------------------- */}
          <section id="errors" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Errors</h2>
            <div className="space-y-3">
              <ErrorCard
                code="400"
                title="Missing or invalid AniList ID"
                body="Returned when the anilist param is missing or not a positive number. Response includes usage hint."
              />
              <ErrorCard
                code="400"
                title="Unknown provider"
                body="Returned when the provider param is not one of the 7 valid provider ids. Response lists the valid values."
              />
              <ErrorCard
                code="404"
                title="AniList ID not found"
                body="The anilistId doesn't exist on AniList itself. Double-check the ID — it's the number in the anilist.co/anime/{id} URL."
              />
              <ErrorCard
                code="404"
                title="Could not resolve on provider"
                body="AniList ID is valid, but the provider doesn't have this anime in its catalog (or lists it under a title we didn't try). Response includes triedTitles so you can see what was searched. Try the universal al:{anilistId} on a different provider."
              />
              <ErrorCard
                code="502"
                title="Upstream error"
                body="The provider's upstream site or AniList itself returned an error. Usually transient — retry after a few seconds."
              />
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}

function UseCase({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <h4 className="mb-1 text-sm font-semibold text-zinc-100">{title}</h4>
      <p className="text-sm text-zinc-400">{body}</p>
    </div>
  );
}

function StrategyCard({ name, color, body }: { name: string; color: "emerald" | "amber" | "sky"; body: string }) {
  const colors = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-300",
    sky: "border-sky-500/30 bg-sky-500/5 text-sky-300",
  }[color];
  return (
    <div className={`rounded-lg border p-4 ${colors}`}>
      <div className="mb-1 flex items-center gap-2">
        <code className="font-mono text-sm font-bold">{name}</code>
      </div>
      <p className="text-sm text-zinc-300">{body}</p>
    </div>
  );
}

function ErrorCard({ code, title, body }: { code: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded bg-rose-500/15 px-2 py-0.5 font-mono text-xs font-bold text-rose-400">
          {code}
        </span>
        <span className="text-sm font-semibold text-zinc-100">{title}</span>
      </div>
      <p className="text-sm text-zinc-400">{body}</p>
    </div>
  );
}
