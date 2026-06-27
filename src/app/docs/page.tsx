import Link from "next/link";
import { EndpointCard } from "@/components/docs/endpoint-card";
import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/code-tabs";
import { ParamTable } from "@/components/docs/param-table";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { ApiTester } from "@/components/docs/api-tester";

export const metadata = {
  title: "API Docs — Animetsu Scraper",
  description:
    "Complete REST API reference for the multi-provider anime scraping backend. 10 endpoints across 7 providers (animetsu, anikuro, animeyubi, miruro, animex, anilight, anipm) with AniList enrichment, CORS proxy, and raw response inspection.",
};

const SIDEBAR_SECTIONS = [
  {
    title: "Getting Started",
    items: [
      { id: "try-it", label: "Try It Live" },
      { id: "overview", label: "Overview" },
      { id: "base-url", label: "Base URL" },
      { id: "authentication", label: "Authentication" },
      { id: "quick-start", label: "Quick Start" },
      { id: "universal-routing", label: "Universal Routing" },
      { id: "rate-limits", label: "Rate Limits" },
    ],
  },
  {
    title: "Providers",
    items: [{ id: "providers", label: "List Providers" }],
  },
  {
    title: "Discovery",
    items: [
      { id: "search", label: "Search" },
      { id: "info", label: "Anime Info" },
      { id: "episodes", label: "Episodes" },
      { id: "servers", label: "Servers" },
      { id: "sources", label: "Stream Sources" },
      { id: "raw", label: "Raw Response" },
      { id: "resolve", label: "Resolve AniList ID" },
      { id: "recent", label: "Recent Releases" },
    ],
  },
  {
    title: "Enrichment",
    items: [{ id: "anilist", label: "AniList" }],
  },
  {
    title: "Streaming",
    items: [{ id: "proxy", label: "CORS Proxy" }],
  },
  {
    title: "Reference",
    items: [
      { id: "types", label: "TypeScript Types" },
      { id: "errors", label: "Errors" },
      { id: "changelog", label: "Changelog" },
    ],
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 text-zinc-200 hover:text-white">
              <span className="text-lg">◆</span>
              <span className="font-semibold">Animetsu Scraper</span>
            </Link>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
              API Docs
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a
              href="https://github.com"
              className="text-zinc-400 transition-colors hover:text-zinc-200"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <Link
              href="/"
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Live Demo →
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              v1.3.0 · Stable · 10 endpoints · 4 providers
            </div>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Anime Scraper API
            </h1>
            <p className="mb-6 text-lg text-zinc-400">
              A unified REST API for searching anime catalogs, fetching episode
              lists, and resolving playable stream URLs across multiple
              providers. One consistent response shape — no matter which
              upstream the data came from.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#quick-start"
                className="rounded-md bg-emerald-500 px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-emerald-400"
              >
                Quick Start
              </a>
              <a
                href="#providers"
                className="rounded-md border border-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                Browse Endpoints
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Try It Live — full-width section above the sidebar/content split */}
      <section id="try-it" className="scroll-mt-20 border-b border-zinc-800 bg-zinc-950">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="mb-6 max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Interactive Playground
            </div>
            <h2 className="mb-2 text-3xl font-bold text-white">Try It Live</h2>
            <p className="text-zinc-400">
              Pick an endpoint, fill in the parameters, and hit{" "}
              <span className="font-semibold text-zinc-200">Send</span>. When you
              fire a <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-emerald-400">/sources</code>{" "}
              request, a real player spins up below the response so you can watch
              the stream you just resolved — no separate page, no copy-paste.
            </p>
          </div>
          <ApiTester />
        </div>
      </section>

      {/* Main layout: sidebar + content */}
      <div className="mx-auto flex max-w-7xl gap-12 px-6 py-10">
        <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-64 shrink-0 overflow-y-auto lg:block">
          <DocsSidebar sections={SIDEBAR_SECTIONS} />
        </aside>

        <main className="min-w-0 flex-1 divide-y divide-zinc-800">
          {/* ---------------------------------------------------------------- */}
          {/* OVERVIEW                                                          */}
          {/* ---------------------------------------------------------------- */}
          <section id="overview" className="scroll-mt-20 pb-2">
            <h2 className="mb-3 text-2xl font-bold text-white">Overview</h2>
            <p className="mb-4 text-zinc-400">
              The Animetsu Scraper API is a self-hostable Next.js backend that
              abstracts four independent anime streaming providers behind a
              single unified interface. You write one client, point it at this
              API, and you can swap providers at runtime with a single query
              parameter — no code changes required.
            </p>
            <p className="mb-4 text-zinc-400">
              Each provider wraps a different upstream site (animetsu.live,
              anikuro.ru, animeyubi.com, miruro.to, animex.one, anilight.live,
              ani.pm), normalizes its response into the
              unified TypeScript types documented below, and exposes the raw
              upstream JSON alongside the normalized data so you can inspect
              exactly what the provider returned. All HLS / MP4 / subtitle URLs
              are routed through a built-in CORS proxy so the browser can fetch
              them directly.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Providers" value="7" sub="animetsu · anikuro · animeyubi · miruro · animex · anilight · anipm" />
              <StatCard label="Endpoints" value="10" sub="REST · JSON · cached" />
              <StatCard label="Latency" value="<2s" sub="p50 for full search→play flow" />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* BASE URL                                                          */}
          {/* ---------------------------------------------------------------- */}
          <section id="base-url" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Base URL</h2>
            <p className="mb-4 text-zinc-400">
              All endpoints are relative to your deployment origin. If you're
              running locally, the base URL is <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-emerald-400">http://localhost:3000</code>.
              In production, replace it with your deployment URL (Vercel, Fly,
              your own server, etc.).
            </p>
            <CodeBlock
              label="Base URL"
              language="text"
              code={`https://your-deployment.example.com/api/scrape`}
            />
            <p className="text-sm text-zinc-500">
              Every documented path below is appended to <code className="font-mono text-zinc-400">/api/scrape</code>{" "}
              (or <code className="font-mono text-zinc-400">/api/proxy</code> for the streaming proxy).
            </p>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* AUTHENTICATION                                                    */}
          {/* ---------------------------------------------------------------- */}
          <section id="authentication" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Authentication</h2>
            <p className="mb-4 text-zinc-400">
              No authentication is required. The API is fully open — anyone with
              the base URL can call any endpoint. This is by design: the API is
              meant to be self-hosted behind your own access control (Cloudflare
              Access, Vercel password protection, a reverse proxy with auth,
              etc.).
            </p>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
              <strong className="font-semibold">Note:</strong> If you deploy this
              publicly without an auth layer, anyone can use your server's
              bandwidth to proxy video streams. Put it behind a gateway or rate
              limiter if it's exposed to the internet.
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* QUICK START                                                       */}
          {/* ---------------------------------------------------------------- */}
          <section id="quick-start" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Quick Start</h2>
            <p className="mb-4 text-zinc-400">
              The canonical flow to go from a search query to a playable stream
              is four requests: <code className="font-mono text-emerald-400">search</code> →{" "}
              <code className="font-mono text-emerald-400">info</code> →{" "}
              <code className="font-mono text-emerald-400">episodes</code> →{" "}
              <code className="font-mono text-emerald-400">sources</code>. Pass
              the anime <code className="font-mono text-zinc-400">id</code> from
              the search response into the next two calls, and the episode
              <code className="font-mono text-zinc-400"> number</code> (not{" "}
              <code className="font-mono text-zinc-400">id</code>) into the
              sources call.
            </p>
            <CodeTabs
              description="A complete flow in JavaScript, from search to playback:"
              tabs={[
                {
                  label: "JavaScript",
                  language: "js",
                  code: `const BASE = "https://your-deployment.example.com/api/scrape";
const provider = "animetsu"; // or "anikuro" | "animeyubi" | "miruro" | "animex" | "anilight" | "anipm"

// UNIVERSAL ROUTING: if you already know the AniList ID (e.g. 154587 =
// Frieren), use "al:154587" as the id on ANY provider — the backend resolves
// it via title search. /search is only needed when you don't know the ID.
const ANILIST_ID = "al:154587";

// 1. (Optional) Search for an anime by title — only if you don't know the AniList ID
const search = await fetch(
  \`\${BASE}/search?q=frieren&provider=\${provider}\`
).then((r) => r.json());
const anime = search.results[0];
console.log("Found:", anime.title.preferred);

// 2. Fetch full metadata (auto-enriched with AniList data)
const info = await fetch(
  \`\${BASE}/info?id=\${ANILIST_ID}&provider=\${provider}\`
).then((r) => r.json());
console.log("Synopsis:", info.description);
console.log("Episodes:", info.totalEpisodes);

// 3. Get the episode list
const episodes = await fetch(
  \`\${BASE}/episodes?id=\${ANILIST_ID}&provider=\${provider}\`
).then((r) => r.json());
const episode = episodes[0];
console.log("First episode:", episode.number, episode.title);

// 4. Resolve playable stream URLs for episode 1
const sources = await fetch(
  \`\${BASE}/sources?id=\${ANILIST_ID}&ep=1&server=kite&type=sub&provider=\${provider}\`
).then((r) => r.json());

// 5. Drop the master URL into an HLS player
const hls = sources.sources.find((s) => s.isMaster);
console.log("Play this:", hls.url);
// → /api/proxy/m3u8?url=https%3A%2F%2Fswiftstream.top%2F...%2Fmaster.m3u8`,
                },
                {
                  label: "Python",
                  language: "python",
                  code: `import requests

BASE = "https://your-deployment.example.com/api/scrape"
PROVIDER = "animetsu"  # or "anikuro" | "animeyubi" | "miruro" | "animex" | "anilight" | "anipm"

# UNIVERSAL ROUTING: if you already know the AniList ID (e.g. 154587 =
# Frieren), use "al:154587" as the id on ANY provider — the backend resolves
# it via title search. /search is only needed when you don't know the ID.
ANILIST_ID = "al:154587"

# 1. (Optional) Search — only if you don't know the AniList ID
search = requests.get(f"{BASE}/search", params={
    "q": "frieren",
    "provider": PROVIDER,
}).json()
anime = search["results"][0]
print(f"Found: {anime['title']['preferred']}")

# 2. Metadata + episodes
info = requests.get(f"{BASE}/info", params={
    "id": ANILIST_ID, "provider": PROVIDER,
}).json()
episodes = requests.get(f"{BASE}/episodes", params={
    "id": ANILIST_ID, "provider": PROVIDER,
}).json()
print(f"Episodes: {len(episodes)}")

# 3. Stream sources for episode 1
sources = requests.get(f"{BASE}/sources", params={
    "id": ANILIST_ID, "ep": 1, "server": "kite",
    "type": "sub", "provider": PROVIDER,
}).json()

master = next(s for s in sources["sources"] if s["isMaster"])
print(f"Play this URL: {master['url']}")`,
                },
                {
                  label: "curl",
                  language: "bash",
                  code: `# 1. Search (optional — skip if you already know the AniList ID)
curl "https://your-deployment.example.com/api/scrape/search?q=frieren&provider=animetsu"

# 2. Info — use the universal AniList ID "al:154587" (Frieren)
curl "https://your-deployment.example.com/api/scrape/info?id=al:154587&provider=animetsu"

# 3. Episodes
curl "https://your-deployment.example.com/api/scrape/episodes?id=al:154587&provider=animetsu"

# 4. Sources (ep=1, server=kite, type=sub)
curl "https://your-deployment.example.com/api/scrape/sources?id=al:154587&ep=1&server=kite&type=sub&provider=animetsu"

# 5. The first source URL is already proxied — pipe it into mpv / ffplay:
curl -s "https://your-deployment.example.com/api/scrape/sources?id=12345&ep=1&server=kite&type=sub&provider=animetsu" \\
  | jq -r '.sources[] | select(.isMaster) | .url' \\
  | xargs mpv`,
                },
              ]}
            />
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* UNIVERSAL ROUTING                                                 */}
          {/* ---------------------------------------------------------------- */}
          <section id="universal-routing" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Universal Routing</h2>
            <p className="mb-4 text-zinc-400">
              The biggest source of confusion in a multi-provider scraper is that
              every provider has its own native id format. Animetsu uses 24-char
              Mongo ObjectIds (<code className="font-mono text-zinc-400">6989b8a029cf95f4eb03b500</code>);
              anikuro uses numerics (<code className="font-mono text-zinc-400">4231</code>);
              miruro, animex, and anilight use AniList IDs natively; anipm uses
              its own composite (<code className="font-mono text-zinc-400">anipm:6351:frieren-beyond-...</code>).
              A user looking at the docs has no idea what to plug in.
            </p>
            <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
              <strong className="font-semibold text-emerald-300">The solution:</strong>{" "}
              <span className="text-zinc-300">
                Every endpoint that takes an <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-emerald-400">id</code> parameter
                accepts the universal format <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-emerald-400">al:{"{anilistId}"}</code>.
                The backend resolves it to the provider's native id automatically —
                you never have to know or care what the native id is.
              </span>
            </div>
            <p className="mb-3 text-zinc-400">
              Pick any anime on{" "}
              <a
                href="https://anilist.co/search/anime"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline"
              >
                AniList
              </a>{" "}
              — the numeric id in the URL (e.g.{" "}
              <code className="font-mono text-zinc-400">anilist.co/anime/154587</code>) is
              the AniList ID. Prefix it with <code className="font-mono text-zinc-400">al:</code> and
              you have a universal id that works on every provider.
            </p>
            <CodeBlock
              language="text"
              label="ID formats accepted by every endpoint"
              code={`al:154587                       ← universal, works on EVERY provider
al:154587:sousou-no-frieren     ← anilight/anipm composite (passthrough)
6989b8a029cf95f4eb03b500        ← animetsu native id (also accepted)
4231                            ← anikuro native id (also accepted)
anipm:6351:frieren-beyond-journey-end  ← anipm native id (also accepted)`}
            />
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              How resolution works
            </h4>
            <p className="mb-3 text-zinc-400">
              When you pass <code className="font-mono text-zinc-400">al:154587</code> on
              a provider that doesn't natively index by AniList ID (animetsu, anikuro,
              animeyubi, anipm), the backend:
            </p>
            <ol className="mb-4 space-y-2 text-sm text-zinc-400 list-decimal pl-6">
              <li>Fetches the AniList media document for that ID (cached 30 min).</li>
              <li>Collects candidate titles: english, romaji, native, synonyms.</li>
              <li>Runs the provider's <code className="font-mono text-zinc-400">search()</code> with each candidate in priority order.</li>
              <li>Picks the first hit (preferring results whose <code className="font-mono text-zinc-400">anilistId</code> matches).</li>
              <li>Caches the resolved native id for 30 min so subsequent calls on the same provider+anime are instant.</li>
            </ol>
            <p className="mb-3 text-zinc-400">
              For providers that natively index by AniList ID (miruro, animex, anilight),
              the <code className="font-mono text-zinc-400">al:{"{anilistId}"}</code> form
              is passed straight through with zero overhead.
            </p>
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              The same anime, three providers, one id
            </h4>
            <CodeBlock
              language="bash"
              label="Frieren (AniList 154587) on every provider"
              code={`# Animetsu (Mongo ObjectId under the hood)
curl ".../api/scrape/sources?id=al:154587&ep=1&provider=animetsu"

# Anikuro (numeric id under the hood)
curl ".../api/scrape/sources?id=al:154587&ep=1&provider=anikuro"

# Ani.pm (anipm:{seriesId}:{slug} under the hood)
curl ".../api/scrape/sources?id=al:154587&ep=1&provider=anipm"

# Miruro (al:154587 is its native format — zero resolution overhead)
curl ".../api/scrape/sources?id=al:154587&ep=1&provider=miruro"`}
            />
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
              <strong className="font-semibold">Tip:</strong> To explicitly inspect what
              native id the resolver picked (and which title it matched on), hit the{" "}
              <code className="font-mono">/api/scrape/resolve</code> endpoint documented below.
              It returns the full resolution trace — useful for debugging "why doesn't this
              anime resolve on provider X".
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* RATE LIMITS                                                       */}
          {/* ---------------------------------------------------------------- */}
          <section id="rate-limits" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Rate Limits</h2>
            <p className="mb-4 text-zinc-400">
              There are no hard rate limits built in. However, each request
              fans out to one or more upstream anime sites, which DO rate-limit
              aggressively. Be a good citizen:
            </p>
            <ul className="mb-4 space-y-2 text-sm text-zinc-400">
              <li className="flex gap-2">
                <span className="text-emerald-400">•</span>
                <span>
                  Cache responses client-side. The API sets{" "}
                  <code className="font-mono text-zinc-400">Cache-Control</code>{" "}
                  headers ranging from 60s (sources) to 1h (providers list) — respect them.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400">•</span>
                <span>
                  Don't hammer search with the same query. If you're building a
                  search-as-you-type UI, debounce by 300ms+.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400">•</span>
                <span>
                  The <code className="font-mono text-zinc-400">anikuro</code>{" "}
                  provider fans out to up to 11 upstreams per{" "}
                  <code className="font-mono text-zinc-400">/sources</code> call.
                  Expect ~3-8s response time on cold cache.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400">•</span>
                <span>
                  AniList (used for enrichment) rate-limits to ~90 req/min. The
                  server caches AniList responses for 30 min.
                </span>
              </li>
            </ul>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* PROVIDERS                                                         */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="providers"
            method="GET"
            path="/api/scrape/providers"
            title="List all providers"
            description="Returns the metadata for every registered provider. Use this to populate a provider switcher UI or to discover which providers support dub streams."
          >
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Response
            </h4>
            <CodeBlock
              language="json"
              label="200 OK"
              code={`{
  "providers": [
    {
      "id": "animetsu",
      "label": "Animetsu",
      "description": "Soft sub · Multi quality · Cloudflare-fronted",
      "accent": "from-rose-500 to-orange-500",
      "supportsDub": true,
      "defaultServer": "kite"
    },
    {
      "id": "anikuro",
      "label": "Anikuro",
      "description": "11 upstream providers · Sub/Dub · AniList IDs native",
      "accent": "from-violet-500 to-fuchsia-500",
      "supportsDub": true,
      "defaultServer": "animeverse"
    },
    {
      "id": "animeyubi",
      "label": "Animeyubi",
      "description": "AnimePahe mirror · Sub/Dub · Kwik embeds",
      "accent": "from-emerald-500 to-teal-500",
      "supportsDub": true,
      "defaultServer": "kwik-mp4"
    },
    {
      "id": "miruro",
      "label": "Miruro",
      "description": "AniList-native · 7 streaming providers · Sub/Dub · Skip markers",
      "accent": "from-sky-500 to-indigo-500",
      "supportsDub": true,
      "defaultServer": "bonk"
    },
    {
      "id": "animex",
      "label": "Animex",
      "description": "AniList-native catalog with flixcloud.cc embeds (sub + dual audio).",
      "accent": "from-pink-500 to-rose-500",
      "supportsDub": true,
      "defaultServer": "flixcloud"
    },
    {
      "id": "anilight",
      "label": "Anilight",
      "description": "AniList-native catalog · MegaPlay streams · Sub/Dub · Skip markers",
      "accent": "from-amber-500 to-orange-500",
      "supportsDub": true,
      "defaultServer": "megaplay"
    },
    {
      "id": "anipm",
      "label": "Ani.pm",
      "description": "Ani.pm — Vega MP4 + Onyx HLS + MegaPlay · sub & dub · all servers",
      "accent": "from-indigo-500 to-violet-500",
      "supportsDub": true,
      "defaultServer": "onyx-hls"
    }
  ]
}`}
            />
            <p className="mt-3 text-sm text-zinc-500">
              Cached for 1 hour. Use this endpoint once at app startup.
            </p>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* SEARCH                                                            */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="search"
            method="GET"
            path="/api/scrape/search?q={query}&provider={provider}"
            title="Search anime"
            description="Search a provider's catalog for anime matching a free-text query. Returns a list of unified search results — pick one and pass its id into /info or /episodes."
          >
            <ParamTable
              params={[
                {
                  name: "q",
                  type: "string",
                  required: true,
                  description: "Free-text search query (anime title).",
                },
                {
                  name: "provider",
                  type: "enum",
                  default: "animetsu",
                  description: "One of: animetsu, anikuro, animeyubi, miruro, animex, anilight, anipm.",
                },
              ]}
            />
            <CodeTabs
              tabs={[
                {
                  label: "curl",
                  code: `curl "https://your-deployment.example.com/api/scrape/search?q=frieren&provider=animetsu"`,
                },
                {
                  label: "JavaScript",
                  code: `const res = await fetch(
  "/api/scrape/search?q=frieren&provider=animetsu"
).then((r) => r.json());
console.log(res.results[0].title.preferred);`,
                },
              ]}
            />
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Response (animetsu)
            </h4>
            <CodeBlock
              language="json"
              label="200 OK"
              code={`{
  "results": [
    {
      "id": "14682",
      "title": {
        "romaji": "Sousou no Frieren",
        "english": "Frieren: Beyond Journey's End",
        "native": "葬送のフリーレン"
      },
      "coverImage": {
        "large": "https://animetsu.live/cdn/...",
        "medium": "https://animetsu.live/cdn/...",
        "color": "#e8b4b8"
      },
      "banner": "https://animetsu.live/cdn/banner.jpg",
      "description": "Frieren, an elven mage...",
      "status": "FINISHED",
      "year": 2023,
      "format": "TV",
      "genres": ["Adventure", "Drama", "Fantasy"],
      "averageScore": 89,
      "totalEpisodes": 28,
      "isAdult": false,
      "duration": 24,
      "season": "FALL"
    }
  ],
  "provider": "animetsu"
}`}
            />
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              <strong className="text-zinc-200">Provider differences:</strong>
              <ul className="mt-2 space-y-1">
                <li>
                  <code className="text-emerald-400">animetsu</code> — does not
                  return <code className="font-mono text-zinc-400">anilistId</code> in
                  search results, but you can still query it with the universal{" "}
                  <code className="font-mono text-zinc-400">al:{"{anilistId}"}</code>{" "}
                  ID format — the backend auto-resolves it via title search.
                </li>
                <li>
                  <code className="text-emerald-400">anikuro</code> — returns
                  native <code className="font-mono text-zinc-400">anilistId</code> and{" "}
                  <code className="font-mono text-zinc-400">malId</code> for every result.
                </li>
                <li>
                  <code className="text-emerald-400">animeyubi</code> — returns
                  minimal metadata (title + cover image only). Use{" "}
                  <code className="font-mono text-zinc-400">/info</code> to get the full document.
                </li>
                <li>
                  <code className="text-emerald-400">miruro</code> — AniList-native:
                  returns full AniList metadata (banner, genres, studios, trailer)
                  in search results. IDs are prefixed with{" "}
                  <code className="font-mono text-zinc-400">al:</code> (e.g.{" "}
                  <code className="font-mono text-zinc-400">al:154587</code>).
                </li>
                <li>
                  <code className="text-emerald-400">animex</code> — AniList-native
                  catalog backed by{" "}
                  <a
                    href="https://animex.one"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline"
                  >
                    animex.one
                  </a>{" "}
                  with flixcloud.cc embeds. Returns dual-audio (sub+dub) for most
                  recent releases. IDs are prefixed with{" "}
                  <code className="font-mono text-zinc-400">al:</code>. Server-side
                  m3u8 extraction via WASM + PBKDF2 + AES-CBC when Cloudflare allows;
                  iframe fallback otherwise.
                </li>
                <li>
                  <code className="text-emerald-400">anilight</code> — REST API at{" "}
                  <a
                    href="https://anilight.live"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline"
                  >
                    anilight.live
                  </a>{" "}
                  with megaplay.buzz HLS streams. Sub + dub, intro/outro skip
                  markers, VTT subtitles. IDs are{" "}
                  <code className="font-mono text-zinc-400">al:{"{anilistId}"}:{"{slug}"}</code>.
                  Cloudflare-bypassed via curl.
                </li>
                <li>
                  <code className="text-emerald-400">anipm</code> — wraps{" "}
                  <a
                    href="https://ani.pm"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline"
                  >
                    ani.pm
                  </a>{" "}
                  and scrapes EVERY server the site exposes: Vega (MP4 file
                  server), Onyx (HLS master with 1080p/720p/360p variants), Vidnest
                  (iframe embed), and MegaPlay (HLS via megaplay.buzz). Source order
                  in the response: <strong>m3u8 first, MP4 second, iframe last</strong>.
                  IDs are{" "}
                  <code className="font-mono text-zinc-400">anipm:{"{seriesId}"}:{"{slug}"}</code>.
                </li>
              </ul>
            </div>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* INFO                                                              */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="info"
            method="GET"
            path="/api/scrape/info?id={animeId}&provider={provider}&enrich={0|1}"
            title="Get anime info"
            description="Fetch the full metadata document for a single anime. If the provider exposes an AniList ID and enrich is enabled (default), the response is automatically merged with AniList data: characters, studios, recommendations, trailer, etc."
          >
            <ParamTable
              params={[
                {
                  name: "id",
                  type: "string",
                  required: true,
                  description: "Anime id from a previous /search response.",
                },
                {
                  name: "provider",
                  type: "enum",
                  default: "animetsu",
                  description: "One of: animetsu, anikuro, animeyubi, miruro, animex, anilight, anipm.",
                },
                {
                  name: "enrich",
                  type: "0 | 1",
                  default: "1",
                  description:
                    "Set to 0 to skip AniList enrichment (faster, but no characters/studios/recommendations).",
                },
              ]}
            />
            <CodeTabs
              tabs={[
                {
                  label: "curl (AniList ID)",
                  code: `curl "https://your-deployment.example.com/api/scrape/info?id=al:154587&provider=animetsu"`,
                },
                {
                  label: "curl (native ID)",
                  code: `curl "https://your-deployment.example.com/api/scrape/info?id=14682&provider=animetsu"`,
                },
                {
                  label: "Skip enrichment",
                  code: `curl "https://your-deployment.example.com/api/scrape/info?id=al:154587&provider=animetsu&enrich=0"`,
                },
              ]}
            />
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Response
            </h4>
            <CodeBlock
              language="json"
              label="200 OK (enriched)"
              code={`{
  "id": "14682",
  "anilistId": 154587,
  "malId": 52991,
  "title": {
    "romaji": "Sousou no Frieren",
    "english": "Frieren: Beyond Journey's End",
    "native": "葬送のフリーレン"
  },
  "coverImage": { "large": "https://..." },
  "banner": "https://...",
  "description": "Frieren, an elven mage, is a member of the hero party...",
  "status": "FINISHED",
  "year": 2023,
  "format": "TV",
  "genres": ["Adventure", "Drama", "Fantasy"],
  "averageScore": 89,
  "totalEpisodes": 28,
  "duration": 24,
  "season": "FALL",
  "anilist": {
    "id": 154587,
    "trailer": { "id": "ASLk6aY-B3Q", "site": "youtube" },
    "studios": [
      { "id": 1441, "name": "Madhouse", "isAnimationStudio": true }
    ],
    "characters": [
      {
        "id": 1,
        "name": { "full": "Frieren", "native": "フリーレン" },
        "image": "https://...",
        "role": "MAIN",
        "voiceActor": { "name": { "full": "Atsumi Tanezaki" } }
      }
    ],
    "recommendations": [
      { "id": 12345, "title": "Vinland Saga", "coverImage": "https://..." }
    ]
  }
}`}
            />
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              If the provider doesn't expose an AniList ID (or if{" "}
              <code className="font-mono text-zinc-400">enrich=0</code>), the
              response omits the <code className="font-mono text-zinc-400">anilist</code> field.
              Returns <code className="font-mono text-zinc-400">404</code> if the id doesn't exist.
            </div>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* EPISODES                                                          */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="episodes"
            method="GET"
            path="/api/scrape/episodes?id={animeId}&provider={provider}"
            title="Get episode list"
            description="Returns the full list of episodes for the given anime, sorted by episode number. Each episode exposes a sourceId that's used internally — you only need the number field for the /sources call."
          >
            <ParamTable
              params={[
                {
                  name: "id",
                  type: "string",
                  required: true,
                  description: "Anime id from /search or /info.",
                },
                {
                  name: "provider",
                  type: "enum",
                  default: "animetsu",
                  description: "One of: animetsu, anikuro, animeyubi, miruro, animex, anilight, anipm.",
                },
              ]}
            />
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl "https://your-deployment.example.com/api/scrape/episodes?id=al:154587&provider=animetsu"`}
            />
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Response
            </h4>
            <CodeBlock
              language="json"
              label="200 OK"
              code={`[
  {
    "number": 1,
    "displayNumber": "1",
    "sourceId": "14682",
    "title": "The Journey's End",
    "description": "After a ten-year journey...",
    "thumbnail": "https://...",
    "airedAt": "2023-09-29T16:00:00.000Z",
    "duration": 24,
    "filler": false,
    "variants": ["sub", "dub"]
  },
  {
    "number": 2,
    "displayNumber": "2",
    "sourceId": "14682",
    "title": "It Didn't Have to Be a Magic Blast",
    "filler": false,
    "variants": ["sub", "dub"]
  }
]`}
            />
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              <strong className="text-zinc-200">Key field:</strong>{" "}
              <code className="font-mono text-emerald-400">variants</code> tells
              you which audio variants are available for this episode. Pass{" "}
              <code className="font-mono text-zinc-400">type=sub</code> or{" "}
              <code className="font-mono text-zinc-400">type=dub</code> to{" "}
              <code className="font-mono text-zinc-400">/sources</code> accordingly.
            </div>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* SERVERS                                                           */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="servers"
            method="GET"
            path="/api/scrape/servers?id={animeId}&ep={episode}&provider={provider}"
            title="Get streaming servers"
            description="Returns the list of available streaming servers for a specific episode. Some providers (anikuro) treat each upstream as a 'server'; others (animetsu) have multiple servers per episode. If the provider doesn't implement getServers, returns an empty array."
          >
            <ParamTable
              params={[
                {
                  name: "id",
                  type: "string",
                  required: true,
                  description: "Anime id.",
                },
                {
                  name: "ep",
                  type: "number",
                  required: true,
                  description: "Episode number (1-indexed).",
                },
                {
                  name: "provider",
                  type: "enum",
                  default: "animetsu",
                  description: "One of: animetsu, anikuro, animeyubi, miruro, animex, anilight, anipm.",
                },
              ]}
            />
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl "https://your-deployment.example.com/api/scrape/servers?id=al:154587&ep=1&provider=animetsu"`}
            />
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Response (per provider)
            </h4>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 text-xs font-semibold text-rose-400">animetsu</div>
                <CodeBlock
                  language="json"
                  code={`[
  { "id": "kite", "label": "kite", "default": true },
  { "id": "gogo", "label": "gogo" },
  { "id": "vidstream", "label": "vidstream" }
]`}
                />
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 text-xs font-semibold text-violet-400">anikuro</div>
                <CodeBlock
                  language="json"
                  code={`[
  { "id": "animeverse", "label": "animeverse", "description": "MP4 — fast", "default": true },
  { "id": "animepahe", "label": "animepahe" },
  { "id": "anikoto", "label": "anikoto", "description": "HLS — multi quality" },
  // ... 8 more upstreams
]`}
                />
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 text-xs font-semibold text-emerald-400">animeyubi</div>
                <CodeBlock
                  language="json"
                  code={`[
  { "id": "kwik-mp4", "label": "Kwik · MP4", "default": true },
  { "id": "kwik-hls", "label": "Kwik · HLS" }
]`}
                />
              </div>
            </div>
            <p className="mt-3 text-sm text-zinc-500">
              Pass any of these <code className="font-mono text-zinc-400">id</code> values
              as the <code className="font-mono text-zinc-400">server</code> parameter
              to <code className="font-mono text-zinc-400">/sources</code>.
            </p>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* SOURCES                                                           */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="sources"
            method="GET"
            path="/api/scrape/sources?id={animeId}&ep={episode}&server={server}&type={sub|dub}&provider={provider}"
            title="Get stream sources"
            description="The main endpoint — resolves playable stream URLs for a specific episode. Returns HLS master playlists, individual quality variants, MP4 files, or iframe embeds (for kwik.cx), all pre-wrapped through the CORS proxy. Also includes subtitles and intro/outro skip markers when the upstream exposes them."
          >
            <ParamTable
              params={[
                {
                  name: "id",
                  type: "string",
                  required: true,
                  description: "Anime id.",
                },
                {
                  name: "ep",
                  type: "number",
                  required: true,
                  description: "Episode number (1-indexed).",
                },
                {
                  name: "server",
                  type: "string",
                  default: "provider default",
                  description:
                    "Server id from /servers, or omit to use the provider's defaultServer.",
                },
                {
                  name: "type",
                  type: "enum",
                  default: "sub",
                  description: "Audio variant: sub or dub.",
                },
                {
                  name: "provider",
                  type: "enum",
                  default: "animetsu",
                  description: "One of: animetsu, anikuro, animeyubi, miruro, animex, anilight, anipm.",
                },
              ]}
            />
            <CodeTabs
              tabs={[
                {
                  label: "curl (AniList ID)",
                  code: `curl "https://your-deployment.example.com/api/scrape/sources?id=al:154587&ep=1&server=kite&type=sub&provider=animetsu"`,
                },
                {
                  label: "curl (native ID)",
                  code: `curl "https://your-deployment.example.com/api/scrape/sources?id=14682&ep=1&server=kite&type=sub&provider=animetsu"`,
                },
                {
                  label: "JavaScript",
                  code: `const sources = await fetch(
  "/api/scrape/sources?id=al:154587&ep=1&server=kite&type=sub&provider=animetsu"
).then((r) => r.json());

// Pick the master playlist for adaptive quality
const master = sources.sources.find((s) => s.isMaster);
// Or pick a specific quality
const hd = sources.sources.find((s) => s.quality === "1080p");

// HLS player setup (hls.js)
if (Hls.isSupported()) {
  const hls = new Hls();
  hls.loadSource(master.url);
  hls.attachMedia(videoElement);
}`,
                },
              ]}
            />
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Response
            </h4>
            <CodeBlock
              language="json"
              label="200 OK (animetsu)"
              code={`{
  "sources": [
    {
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fswiftstream.top%2F...%2Fmaster.m3u8",
      "type": "master",
      "quality": "auto",
      "isMaster": true,
      "originalUrl": "https://swiftstream.top/.../master.m3u8"
    },
    {
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fswiftstream.top%2F...%2F1080p.m3u8",
      "type": "hls",
      "quality": "1080p",
      "originalUrl": "https://swiftstream.top/.../1080p.m3u8"
    },
    {
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fswiftstream.top%2F...%2F720p.m3u8",
      "type": "hls",
      "quality": "720p"
    },
    {
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fswiftstream.top%2F...%2F360p.m3u8",
      "type": "hls",
      "quality": "360p"
    }
  ],
  "subtitles": [
    {
      "url": "/api/proxy/m3u8?format=vtt&url=https%3A%2F%2F...%2Fen.vtt",
      "lang": "English"
    }
  ],
  "skips": {
    "intro": { "start": 5, "end": 95 },
    "outro": { "start": 1380, "end": 1440 }
  },
  "server": "kite",
  "provider": "animetsu",
  "qualities": [
    { "label": "1080p", "resolution": "1920x1080", "url": "/api/proxy/m3u8?url=..." },
    { "label": "720p",  "resolution": "1280x720",  "url": "/api/proxy/m3u8?url=..." },
    { "label": "360p",  "resolution": "640x360",   "url": "/api/proxy/m3u8?url=..." }
  ]
}`}
            />
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              <strong className="text-zinc-200">Source types:</strong>
              <ul className="mt-2 space-y-1">
                <li>
                  <code className="text-sky-300">master</code> — adaptive HLS
                  playlist (preferred for hls.js / Safari native HLS).
                </li>
                <li>
                  <code className="text-sky-300">hls</code> — single-quality HLS
                  playlist.
                </li>
                <li>
                  <code className="text-sky-300">mp4</code> — direct MP4 file
                  (use in a <code className="font-mono text-zinc-400">&lt;video&gt;</code> tag, supports Range).
                </li>
                <li>
                  <code className="text-sky-300">iframe</code> — kwik.cx embed
                  URL. Render in an{" "}
                  <code className="font-mono text-zinc-400">&lt;iframe&gt;</code> tag
                  with <code className="font-mono text-zinc-400">allow="autoplay; fullscreen"</code>.
                </li>
              </ul>
            </div>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* RAW                                                               */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="raw"
            method="GET"
            path="/api/scrape/raw?id={animeId}&ep={episode}&server={server}&type={sub|dub}&provider={provider}"
            title="Get raw upstream response"
            description="Returns the exact JSON the upstream provider's API returned, before any normalization. Useful for debugging, building provider-specific UIs, or inspecting fields that aren't surfaced in the unified response. Same params as /sources."
          >
            <ParamTable
              params={[
                { name: "id", type: "string", required: true, description: "Anime id." },
                { name: "ep", type: "number", required: true, description: "Episode number." },
                { name: "server", type: "string", description: "Server id." },
                { name: "type", type: "enum", default: "sub", description: "sub or dub." },
                { name: "provider", type: "enum", default: "animetsu", description: "animetsu, anikuro, animeyubi, miruro, animex, anilight, or anipm." },
              ]}
            />
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl "https://your-deployment.example.com/api/scrape/raw?id=14682&ep=1&server=kite&type=sub&provider=animeyubi"`}
            />
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Response shape (varies per provider)
            </h4>
            <CodeBlock
              language="json"
              label="200 OK (animeyubi)"
              code={`{
  "provider": "animeyubi",
  "animeId": "14682",
  "episode": 1,
  "server": "kwik-mp4",
  "streamType": "sub",
  "raw": {
    "provider": "animeyubi",
    "api": "https://animeyubi.com/api/v4/pahe/episodes/12345/",
    "animeId": "14682",
    "episodeId": "12345",
    "episodeNumber": 1,
    "streamType": "sub",
    "server": "kwik-mp4",
    "episode": {
      "title": "1",
      "id": 12345,
      "videos": [
        {
          "title": "SEV · 1080p BD",
          "id": 67890,
          "video_type": "mp4",
          "url": "https://kwik.cx/f/abc123",
          "errors": 0
        }
      ],
      "next": { "title": "2", "id": 12346 },
      "previous": null
    },
    "normalized": [
      {
        "anilist_id": null,
        "episode": 1,
        "stream_type": "sub",
        "provider": "Kwik",
        "server_id": 67890,
        "cdn_host": "kwik.cx",
        "hls_url": null,
        "mp4_url": "https://kwik.cx/f/abc123",
        "rmvb_url": null,
        "stream_format": "mp4",
        "quality": "1080p",
        "embed_url": "https://kwik.cx/f/abc123",
        "video_title": "SEV · 1080p BD",
        "errors": 0
      }
    ]
  },
  "rawMulti": null,
  "unified": {
    "sources": [ /* ... same shape as /sources ... */ ],
    "subtitles": [],
    "skips": null,
    "qualities": null
  }
}`}
            />
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              <strong className="text-zinc-200">Per-provider raw shape:</strong>
              <ul className="mt-2 space-y-1">
                <li>
                  <code className="text-rose-400">animetsu</code> — the upstream{" "}
                  <code className="font-mono text-zinc-400">SourcesResponse</code> object
                  (sources[], subs[], skips).
                </li>
                <li>
                  <code className="text-violet-400">anikuro</code> — returns{" "}
                  <code className="font-mono text-zinc-400">rawMulti</code> as an
                  object keyed by upstream provider name (animeverse, animepahe,
                  etc.), each containing that provider's raw response.
                </li>
                <li>
                  <code className="text-emerald-400">animeyubi</code> — returns a
                  normalized MegaPlay-style payload with{" "}
                  <code className="font-mono text-zinc-400">hls_url</code>,{" "}
                  <code className="font-mono text-zinc-400">mp4_url</code>,{" "}
                  <code className="font-mono text-zinc-400">embed_url</code>,{" "}
                  <code className="font-mono text-zinc-400">stream_type</code>,{" "}
                  <code className="font-mono text-zinc-400">cdn_host</code>, etc.
                </li>
              </ul>
              <p className="mt-2">
                The response always includes a <code className="font-mono text-zinc-400">unified</code> field
                with the same shape as <code className="font-mono text-zinc-400">/sources</code> so you can
                see both raw and normalized side by side.
              </p>
            </div>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* RESOLVE                                                           */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="resolve"
            method="GET"
            path="/api/scrape/resolve?anilist={anilistId}&provider={provider}"
            title="Resolve AniList ID"
            description="Resolves an AniList ID to the provider's native anime id. Useful for figuring out what id to pass to /sources on a given provider, checking whether a provider has a given anime before doing a full /sources lookup, or debugging the universal AniList routing. If `provider` is omitted, resolves across ALL providers in parallel and returns a map of { providerId: ResolveResult | null }."
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
                  default: "(all)",
                  description: "One of: animetsu, anikuro, animeyubi, miruro, animex, anilight, anipm. If omitted, resolves across all providers in parallel.",
                },
              ]}
            />
            <CodeTabs
              tabs={[
                {
                  label: "Single provider",
                  code: `curl "https://your-deployment.example.com/api/scrape/resolve?anilist=154587&provider=animetsu"`,
                },
                {
                  label: "All providers",
                  code: `curl "https://your-deployment.example.com/api/scrape/resolve?anilist=154587"`,
                },
              ]}
            />
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Response
            </h4>
            <CodeBlock
              language="json"
              label="200 OK (single provider)"
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
    "synonyms": ["Frieren: Beyond Journey's End"],
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
  }
}`}
            />
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              <strong className="text-zinc-200">Strategy values:</strong>
              <ul className="mt-2 space-y-1">
                <li>
                  <code className="font-mono text-emerald-400">passthrough</code> —
                  the provider natively accepts <code className="font-mono text-zinc-400">al:{"{id}"}</code> (miruro, animex, anilight).
                </li>
                <li>
                  <code className="font-mono text-emerald-400">title-search</code> —
                  the backend ran the provider's search with AniList candidate titles and matched.
                </li>
                <li>
                  <code className="font-mono text-emerald-400">cache-hit</code> —
                  resolution was served from the in-memory 30-min cache.
                </li>
              </ul>
            </div>
            <p className="mt-3 text-sm text-zinc-500">
              Cached for 5 min. When <code className="font-mono text-zinc-400">provider</code> is
              omitted, the response's <code className="font-mono text-zinc-400">resolved</code> field
              is an object keyed by provider id, each value being a{" "}
              <code className="font-mono text-zinc-400">ResolveResult</code> or{" "}
              <code className="font-mono text-zinc-400">null</code> if the provider doesn't have
              that anime.
            </p>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* RECENT                                                            */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="recent"
            method="GET"
            path="/api/scrape/recent?page={page}&per_page={perPage}"
            title="Get recent releases"
            description="Returns the most recently added anime episodes from the animetsu upstream. Useful for building a 'What's new' landing page. This endpoint is animetsu-only — it does not accept a provider parameter."
          >
            <ParamTable
              params={[
                {
                  name: "page",
                  type: "number",
                  default: "1",
                  description: "Page number (1-indexed).",
                },
                {
                  name: "per_page",
                  type: "number",
                  default: "20",
                  description: "Results per page (max 50).",
                },
              ]}
            />
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl "https://your-deployment.example.com/api/scrape/recent?page=1&per_page=20"`}
            />
            <h4 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Response
            </h4>
            <CodeBlock
              language="json"
              label="200 OK"
              code={`{
  "currentPage": 1,
  "perPage": 20,
  "hasNextPage": true,
  "results": [
    {
      "id": "14682",
      "title": { "romaji": "Sousou no Frieren", "preferred": "Frieren" },
      "cover_image": { "large": "https://..." },
      "episode": 28,
      "aired_at": "2024-03-22T16:00:00.000Z",
      "is_dub": false
    }
  ]
}`}
            />
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* ANILIST                                                           */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="anilist"
            method="GET"
            path="/api/scrape/anilist?id={id} | ?search={query} | ?trending=1"
            title="AniList enrichment"
            description="Direct passthrough to the AniList GraphQL API, cached for 30 minutes. Use this to fetch rich metadata (characters, studios, recommendations, trailers), search AniList by name, or get the current trending list. Exactly one of id, search, or trending must be provided."
          >
            <ParamTable
              params={[
                {
                  name: "id",
                  type: "number",
                  description: "AniList media id. Returns a single media object.",
                },
                {
                  name: "search",
                  type: "string",
                  description: "Free-text search. Returns up to 20 results.",
                },
                {
                  name: "trending",
                  type: "1",
                  description: "Set to '1' to get the current trending anime list.",
                },
              ]}
            />
            <CodeTabs
              tabs={[
                {
                  label: "By ID",
                  code: `curl "https://your-deployment.example.com/api/scrape/anilist?id=154587"`,
                },
                {
                  label: "Search",
                  code: `curl "https://your-deployment.example.com/api/scrape/anilist?search=frieren"`,
                },
                {
                  label: "Trending",
                  code: `curl "https://your-deployment.example.com/api/scrape/anilist?trending=1"`,
                },
              ]}
            />
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              The <code className="font-mono text-zinc-400">/info</code> endpoint
              already calls AniList internally when the provider exposes an{" "}
              <code className="font-mono text-zinc-400">anilistId</code>. Use this
              endpoint only when you need to query AniList directly without going
              through a provider.
            </div>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* PROXY                                                             */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="proxy"
            method="GET"
            path="/api/proxy/m3u8?url={encoded}&format={m3u8|vtt}&referer={encoded}"
            title="CORS proxy for m3u8 / segments / subtitles"
            description="The browser cannot directly fetch upstream video URLs due to CORS and Cloudflare. This proxy fetches them server-side with the right Referer/User-Agent headers, rewrites relative URIs in m3u8 playlists so segment requests also go through the proxy, and returns the response with CORS headers wide open. You usually don't call this directly — the /sources endpoint returns pre-wrapped URLs."
          >
            <ParamTable
              params={[
                {
                  name: "url",
                  type: "string (encoded)",
                  required: true,
                  description: "The absolute upstream URL to proxy (URL-encoded).",
                },
                {
                  name: "format",
                  type: "enum",
                  description: "Hint the response type: 'm3u8' or 'vtt'. If omitted, the proxy auto-detects.",
                },
                {
                  name: "referer",
                  type: "string (encoded)",
                  description: "Override the Referer header sent to the upstream. Used by anikuro HLS streams.",
                },
              ]}
            />
            <CodeBlock
              language="bash"
              label="Direct usage (rare — usually pre-wrapped)"
              code={`curl "https://your-deployment.example.com/api/proxy/m3u8?url=https%3A%2F%2Fswiftstream.top%2Fmaster.m3u8"

# For anikuro streams that need a custom referer:
curl "https://your-deployment.example.com/api/proxy/m3u8?url=https%3A%2F%2Fcdn.mewstream.buzz%2Fmaster.m3u8&referer=https%3A%2F%2Fanikuro.ru%2F"`}
            />
            <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-200">
              <strong className="font-semibold">How it works:</strong>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>
                  Fetches the upstream URL with a browser User-Agent and the
                  appropriate Referer (animetsu.live by default, anikuro.ru if the
                  URL contains anikuro.ru, or your custom referer).
                </li>
                <li>
                  If the response is an m3u8 playlist, rewrites every line so
                  segment URLs and <code className="font-mono">#EXT-X-KEY URI</code> tags
                  point back at this proxy.
                </li>
                <li>
                  If the response is a VTT subtitle, returns it with{" "}
                  <code className="font-mono">text/vtt</code> content-type.
                </li>
                <li>
                  Otherwise streams the binary (TS/fMP4) through with{" "}
                  <code className="font-mono">Access-Control-Allow-Origin: *</code>.
                </li>
              </ol>
            </div>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* TYPES                                                             */}
          {/* ---------------------------------------------------------------- */}
          <section id="types" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">TypeScript Types</h2>
            <p className="mb-4 text-zinc-400">
              The unified types every provider maps to. Copy these into your
              client to get full type safety. The full source is at{" "}
              <code className="font-mono text-emerald-400">src/lib/providers/types.ts</code>.
            </p>
            <CodeBlock
              language="typescript"
              filename="types.ts"
              code={`export type ProviderId =
  | "animetsu"
  | "anikuro"
  | "animeyubi"
  | "miruro"
  | "animex"
  | "anilight"
  | "anipm";

/**
 * Universal ID formats — accepted by EVERY endpoint that takes an \`id\`.
 *
 *   al:{anilistId}              ← universal, works on every provider
 *   al:{anilistId}:{slug}       ← anilight / anipm composite (passthrough)
 *   {provider-native-id}        ← provider's own internal id (also accepted)
 *
 * Resolution is automatic: pass al:154587 to /sources on ANY provider and
 * the backend looks up the AniList title, searches that provider's catalog,
 * and resolves the native id for you. See the "Universal Routing" section.
 */

export interface UnifiedSearchResult {
  id: string;
  anilistId?: number;
  malId?: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
    preferred?: string;
  };
  coverImage?: {
    cover?: string;
    banner?: string;
    large?: string;
    medium?: string;
    small?: string;
    color?: string;
  };
  banner?: string;
  description?: string;
  status?: string;
  year?: number;
  format?: string;
  genres?: string[];
  averageScore?: number;
  totalEpisodes?: number | null;
  isAdult?: boolean;
  duration?: number;
  season?: string;
}

export interface UnifiedEpisode {
  number: number;
  displayNumber?: string;
  sourceId: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  image?: string;
  airedAt?: string;
  duration?: number;
  filler?: boolean;
  variants?: string[]; // ["sub"] | ["sub", "dub"]
}

export interface UnifiedStreamSource {
  /** Proxy-ready URL — drop into an HLS player, <video>, or <iframe> */
  url: string;
  /** "hls" | "mp4" | "master" | "iframe" */
  type: "hls" | "mp4" | "master" | "iframe";
  quality?: string;
  isMaster?: boolean;
  originalUrl?: string;
  upstreamReferer?: string;
}

export interface UnifiedSubtitle {
  url: string;
  lang: string;
}

export interface UnifiedSkipMarkers {
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

export interface UnifiedSources {
  sources: UnifiedStreamSource[];
  subtitles: UnifiedSubtitle[];
  skips?: UnifiedSkipMarkers;
  server: string;
  provider: ProviderId;
  qualities?: { label: string; resolution: string; url: string }[];
  /** Raw upstream payload — only from /api/scrape/raw */
  raw?: unknown;
  rawMulti?: Record<string, unknown>;
}`}
            />
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* ERRORS                                                            */}
          {/* ---------------------------------------------------------------- */}
          <section id="errors" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Errors</h2>
            <p className="mb-4 text-zinc-400">
              All errors follow a consistent JSON shape. HTTP status codes
              follow REST conventions: 400 for bad input, 404 for not found,
              502 for upstream failures.
            </p>
            <CodeBlock
              language="json"
              label="Error response"
              code={`{
  "error": "Missing id or ep."
}`}
            />
            <div className="mt-4 overflow-hidden rounded-lg border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Meaning</th>
                    <th className="px-4 py-2.5 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  <tr>
                    <td className="px-4 py-2.5"><code className="font-mono text-rose-400">400</code></td>
                    <td>Bad Request</td>
                    <td className="text-zinc-400">Missing required query param.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><code className="font-mono text-rose-400">404</code></td>
                    <td>Not Found</td>
                    <td className="text-zinc-400">Anime id doesn't exist on the provider.</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5"><code className="font-mono text-rose-400">502</code></td>
                    <td>Bad Gateway</td>
                    <td className="text-zinc-400">Upstream provider returned an error or timed out.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* CHANGELOG                                                         */}
          {/* ---------------------------------------------------------------- */}
          <section id="changelog" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Changelog</h2>
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                    v1.4.0
                  </span>
                  <span className="text-sm text-zinc-500">2026-06-27</span>
                </div>
                <ul className="space-y-1 text-sm text-zinc-400">
                  <li>• Added <code className="font-mono text-emerald-400">animex</code> provider (animex.one — AniList-native catalog with flixcloud.cc embeds, supports dual-audio for most recent releases).</li>
                  <li>• Reverse-engineered animex's SvelteKit <code className="font-mono text-emerald-400">__data.json</code> chunk protocol (devalue format with integer indices into a flat array — implements proper recursive dereferencing).</li>
                  <li>• Episode discovery probes episodes 1..N in parallel (batch of 12, capped at 24) and skips episodes that don't exist yet.</li>
                  <li>• Returns iframe embed URLs for playback (flixcloud uses encrypted stream URLs decrypted client-side via Crypto-JS — server-side extraction would be fragile due to Cloudflare TLS-fingerprint blocking).</li>
                  <li>• Updated streaming m3u8 proxy: pipes segments through ReadableStream (no buffering), forwards Range headers, handles CORS preflight, auto-picks Referer per upstream host.</li>
                </ul>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                    v1.3.0
                  </span>
                  <span className="text-sm text-zinc-500">2026-06-27</span>
                </div>
                <ul className="space-y-1 text-sm text-zinc-400">
                  <li>• Added <code className="font-mono text-emerald-400">miruro</code> provider (miruro.to — AniList-native with 7 streaming backends: bonk, ally, pewe, moo, bee, kiwi, hop).</li>
                  <li>• Implements miruro's encrypted <code className="font-mono text-emerald-400">/api/secure/pipe</code> protocol (base64url envelope + XOR obfuscation + gzip decompression).</li>
                  <li>• Returns both HLS master playlists (routed through CORS proxy with referer) and iframe embed URLs for CF-protected streams.</li>
                  <li>• Raw payload includes normalized MegaPlay-style fields (hls_url, mp4_url, embed_url, cdn_host, referer).</li>
                </ul>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                    v1.2.0
                  </span>
                  <span className="text-sm text-zinc-500">2026-06-27</span>
                </div>
                <ul className="space-y-1 text-sm text-zinc-400">
                  <li>• Added <code className="font-mono text-emerald-400">animeyubi</code> provider (AnimePahe mirror with kwik.cx iframe embeds).</li>
                  <li>• Added <code className="font-mono text-emerald-400">iframe</code> source type for CF-protected embeds.</li>
                  <li>• Added <code className="font-mono text-emerald-400">/api/scrape/raw</code> endpoint for upstream response inspection.</li>
                  <li>• Added <code className="font-mono text-emerald-400">upstreamReferer</code> field on stream sources.</li>
                </ul>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-zinc-700 px-2 py-0.5 text-xs font-semibold text-zinc-300">
                    v1.1.0
                  </span>
                  <span className="text-sm text-zinc-500">2026-06-15</span>
                </div>
                <ul className="space-y-1 text-sm text-zinc-400">
                  <li>• Added <code className="font-mono text-zinc-300">anikuro</code> provider with 11 upstream providers.</li>
                  <li>• AniList enrichment auto-triggered when provider exposes anilistId.</li>
                </ul>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                    v1.3.0
                  </span>
                  <span className="text-sm text-zinc-500">2026-06-27</span>
                </div>
                <ul className="space-y-1 text-sm text-zinc-300">
                  <li>• Universal AniList ID routing — every endpoint now accepts{" "}
                    <code className="font-mono text-emerald-300">al:{"{anilistId}"}</code> as
                    the <code className="font-mono text-zinc-300">id</code> parameter, resolved
                    automatically per-provider (title-search + 30-min cache).</li>
                  <li>• New{" "}
                    <code className="font-mono text-emerald-300">/api/scrape/resolve</code>{" "}
                    endpoint — explicitly inspect what native id the resolver picked.</li>
                  <li>• Ani.pm (<code className="font-mono text-zinc-300">anipm</code>) 7th
                    provider — Vega MP4 + Onyx HLS + Vidnest + MegaPlay, all servers scraped,
                    m3u8 first / MP4 second / iframe last.</li>
                  <li>• Animex (<code className="font-mono text-zinc-300">animex</code>) and{" "}
                    Anilight (<code className="font-mono text-zinc-300">anilight</code>) providers
                    added — Cloudflare-bypassed HLS via curl + megaplay.buzz pipeline.</li>
                  <li>• Raw payload now exposed on every <code className="font-mono text-zinc-300">/sources</code>{" "}
                    response — full upstream JSON, every server, every CDN host, every URL.</li>
                </ul>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded bg-zinc-700 px-2 py-0.5 text-xs font-semibold text-zinc-300">
                    v1.0.0
                  </span>
                  <span className="text-sm text-zinc-500">2026-05-01</span>
                </div>
                <ul className="space-y-1 text-sm text-zinc-400">
                  <li>• Initial release with <code className="font-mono text-zinc-300">animetsu</code> provider, CORS proxy, and AniList integration.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="border-t border-zinc-800 pt-8 text-sm text-zinc-500">
            <p>
              Built with Next.js 16, TypeScript, and Tailwind CSS. Self-hostable —
              see the{" "}
              <Link href="/" className="text-emerald-400 hover:underline">
                live demo
              </Link>{" "}
              or deploy your own.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small inline helpers                                              */
/* ------------------------------------------------------------------ */

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}
