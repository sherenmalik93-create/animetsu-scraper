import Link from "next/link";
import { EndpointCard } from "@/components/docs/endpoint-card";
import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/code-tabs";
import { ParamTable } from "@/components/docs/param-table";

export const metadata = {
  title: "Ani.pm Provider Docs — Animetsu Scraper",
  description:
    "Dedicated documentation for the anipm provider: all 4 server types (Vega MP4, Onyx HLS, Vidnest iframe, MegaPlay HLS), deep raw scrape endpoint that probes every server, raw payload schema, every API endpoint, and the underlying ani.pm API surface.",
};

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

const SIDEBAR_SECTIONS = [
  {
    title: "Ani.pm Provider",
    items: [
      { id: "overview", label: "Overview" },
      { id: "id-format", label: "ID Format" },
      { id: "servers", label: "Server Types" },
      { id: "raw-payload", label: "Raw Payload Schema" },
    ],
  },
  {
    title: "Endpoints",
    items: [
      { id: "search", label: "Search" },
      { id: "info", label: "Anime Info" },
      { id: "episodes", label: "Episodes" },
      { id: "servers-endpoint", label: "Servers" },
      { id: "sources", label: "Stream Sources" },
      { id: "anipm-raw", label: "Deep Raw Scrape" },
      { id: "raw", label: "Raw Response" },
    ],
  },
  {
    title: "Reference",
    items: [
      { id: "endpoint-comparison", label: "Endpoint Comparison" },
      { id: "upstream-api", label: "Upstream API" },
      { id: "cdn-hosts", label: "CDN Hosts" },
      { id: "cloudflare", label: "Cloudflare Bypass" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function AnipmDocsPage() {
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
            <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-400">
              Ani.pm Docs
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
              ID Finder →
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-zinc-800 bg-gradient-to-b from-indigo-500/10 to-transparent">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            Provider-specific Docs · v1.5.0
          </div>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Ani.pm Provider
          </h1>
          <p className="max-w-3xl text-lg text-zinc-400">
            Wraps{" "}
            <a
              href="https://ani.pm"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-400 hover:underline"
            >
              ani.pm
            </a>{" "}
            and scrapes every server the site exposes. Unlike other providers
            that just grab one stream, anipm enumerates{" "}
            <strong className="text-zinc-200">all 4 server types</strong> per
            episode — Vega (MP4 file server), Onyx (HLS master with
            1080p/720p/360p variants), Vidnest (iframe embed), and MegaPlay
            (HLS via megaplay.buzz). Every URL, every CDN host, every server
            entry is exposed in the raw payload — no filtering, no
            &quot;if it plays&quot; gating.
          </p>
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
            <strong className="font-semibold">New in v1.5.0:</strong>{" "}
            <Link href="#anipm-raw" className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-2 hover:decoration-emerald-300">
              <code className="font-mono">/api/scrape/anipm-raw</code>
            </Link>{" "}
            — a deep raw scrape endpoint that actually probes every server.
            HLS playlists are fetched and parsed (variant count, segment count,
            duration, raw m3u8 text), MP4 files are HEAD-probed for size + Range
            support, iframe URLs are recorded as-is. Not just iframe shit.
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-4">
            <StatCard label="Server Types" value="4" sub="Vega · Onyx · Vidnest · MegaPlay" />
            <StatCard label="Stream Formats" value="3" sub="HLS · MP4 · iframe" />
            <StatCard label="Audio" value="Sub + Dub" sub="Per-episode variants" />
            <StatCard label="Priority" value="HLS → MP4 → iframe" sub="m3u8 first, iframe last" />
          </div>
        </div>
      </section>

      {/* Main layout: sidebar + content */}
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
              Ani.pm is a React SPA backed by an Express-style REST API at{" "}
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-indigo-400">
                https://ani.pm/api/
              </code>
              . Cloudflare fronts the whole origin, so every call needs full
              browser headers (Sec-Ch-Ua, Sec-Fetch-*, Origin) or Cloudflare
              returns a 403 managed-challenge page. The provider handles this
              internally via curl with the full browser header set.
            </p>
            <p className="mb-4 text-zinc-400">
              The provider&apos;s standout feature is{" "}
              <strong className="text-zinc-200">server enumeration</strong>:
              instead of picking one stream and hiding the rest, it returns{" "}
              <strong className="text-zinc-200">every server ani.pm exposes</strong>,
              normalized into the unified source list AND exposed verbatim in
              the raw payload. This lets clients pick the best stream per
              context (HLS for adaptive quality, MP4 for offline download,
              iframe for fallback when Cloudflare blocks direct m3u8 fetches).
            </p>
            <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 text-sm text-indigo-200">
              <strong className="font-semibold">Source priority:</strong> HLS
              master playlists first (most reliable, adaptive quality), MP4
              files second (direct download, range-supported), iframe embeds
              last (fallback only — browser solves any Cloudflare challenge
              natively). Per user instruction:{" "}
              <em>
                &quot;import m3u8 mainly and mp4 ... dont need if playing or
                not&quot;
              </em>{" "}
              — every server is included regardless of whether we can verify
              it&apos;ll play.
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* ID FORMAT                                                         */}
          {/* ---------------------------------------------------------------- */}
          <section id="id-format" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">ID Format</h2>
            <p className="mb-4 text-zinc-400">
              The anipm provider uses a composite id format that encodes both
              the ani.pm numeric series id (used for{" "}
              <code className="font-mono text-zinc-400">/api/anime/series/{"{id}"}</code>)
              and the slug (used for{" "}
              <code className="font-mono text-zinc-400">
                /api/anime/src/servers?title={"{slug}"}
              </code>
              ).
            </p>
            <CodeBlock
              language="text"
              label="Accepted id formats"
              code={`anipm:6351:frieren-beyond-journey-end   ← full format (recommended)
anipm:6351                                ← series id only (slug looked up via cache)
6351                                      ← bare numeric (treated as series id)
al:154587                                 ← universal AniList id (auto-resolved)`}
            />
            <p className="mt-3 text-sm text-zinc-500">
              The universal <code className="font-mono text-zinc-400">al:{"{anilistId}"}</code>{" "}
              format works on anipm too — the backend looks up the AniList
              title, searches ani.pm, and matches automatically. Use the{" "}
              <Link href="/animetsu-id" className="text-indigo-400 hover:underline">
                ID Finder
              </Link>{" "}
              to inspect what native id the resolver picked.
            </p>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* SERVER TYPES                                                      */}
          {/* ---------------------------------------------------------------- */}
          <section id="servers" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Server Types</h2>
            <p className="mb-4 text-zinc-400">
              Ani.pm exposes 4 distinct server types per episode. The provider
              scrapes all of them and exposes each as a separate{" "}
              <code className="font-mono text-zinc-400">UnifiedStreamSource</code> entry.
            </p>

            <div className="space-y-4">
              <ServerTypeCard
                name="Vega"
                kind="file"
                type="mp4"
                color="emerald"
                description="Direct MP4 file server. ani.pm serves ~251MB MP4 files with HTTP Range support — perfect for direct download or <video> playback without HLS. Wrapped through the CORS proxy for CORS headers + Range passthrough."
                upstreamUrl="/api/anime/src/file?t={token}"
              />
              <ServerTypeCard
                name="Onyx"
                kind="hls"
                type="master"
                color="indigo"
                description="HLS master playlist with 1080p/720p/360p quality variants. The upstream m3u8 uses relative URIs that need rewriting — the proxy handles this automatically. Cloudflare-fronted, needs Referer: https://ani.pm/."
                upstreamUrl="/api/anime/src/hls?t={token}"
              />
              <ServerTypeCard
                name="Vidnest"
                kind="embed"
                type="iframe"
                color="amber"
                description="Iframe embed at vidnest.fun. Last-resort fallback — the browser solves any Cloudflare challenge natively. Not proxied; passed through as-is."
                upstreamUrl="https://vidnest.fun/anime/..."
              />
              <ServerTypeCard
                name="MegaPlay"
                kind="hls"
                type="master"
                color="rose"
                description="HLS via megaplay.buzz (same pipeline as the anilight provider). The series doc gives us sub/dub embed URLs for every episode; we probe megaplay's API, extract the m3u8 + subtitles + intro/outro skip markers. Most reliable stream — Cloudflare doesn't challenge megaplay.buzz's CDN."
                upstreamUrl="https://megaplay.buzz/stream/getSourcesNew?id={episode_id}"
              />
            </div>

            <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-400">
              <strong className="text-zinc-200">All servers, all the time.</strong>{" "}
              The provider does not filter servers based on playability,
              quality, or assumed availability. If ani.pm returns a server,
              it&apos;s in the response. The player decides what works.
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* RAW PAYLOAD SCHEMA                                                */}
          {/* ---------------------------------------------------------------- */}
          <section id="raw-payload" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">
              Raw Payload Schema
            </h2>
            <p className="mb-4 text-zinc-400">
              The <code className="font-mono text-zinc-400">raw</code> field on
              the <code className="font-mono text-zinc-400">/sources</code>{" "}
              response contains the full upstream payload — every server ani.pm
              returned, every URL we resolved, every CDN host we touched.
              Returned verbatim so developers can inspect exactly what ani.pm
              gave us.
            </p>
            <CodeBlock
              language="json"
              label="raw payload (annotated)"
              code={`{
  "provider": "anipm",
  "api": {
    "series": "https://ani.pm/api/anime/series/6351",
    "servers": "https://ani.pm/api/anime/src/servers?title=frieren-beyond-journey-end&ep=1",
    "megaplay_variants": "https://megaplay.buzz/api/12345",
    "megaplay_sources": "https://megaplay.buzz/stream/getSourcesNew?id={episode_id}"
  },
  "animeId": "anipm:6351:frieren-beyond-journey-end",
  "episodeNumber": 1,
  "server": "onyx-hls",
  "sourceType": "sub",
  "seriesId": 6351,
  "slug": "frieren-beyond-journey-end",

  "upstream_servers": {
    "sub": [
      { "provider": "Vega",   "kind": "file",  "url": "/api/anime/src/file?t=abc...", "priority": 1 },
      { "provider": "Onyx",   "kind": "hls",   "url": "/api/anime/src/hls?t=def...",  "priority": 2 },
      { "provider": "Vidnest","kind": "embed", "url": "https://vidnest.fun/anime/...", "priority": 3 }
    ],
    "dub": [
      { "provider": "Vega",   "kind": "file",  "url": "/api/anime/src/file?t=ghi..." }
    ]
  },

  "servers_scraped": {
    "hls": [
      {
        "url": "https://ani.pm/api/anime/src/hls?t=def...",
        "proxied_url": "/api/proxy/m3u8?url=https%3A%2F%2Fani.pm%2F...",
        "referer": "https://ani.pm/",
        "kind": "anipm-onyx"
      },
      {
        "url": "https://*.nekostream.site/master.m3u8",
        "proxied_url": "/api/proxy/m3u8?url=...&referer=https%3A%2F%2Fmegaplay.buzz%2F",
        "referer": "https://megaplay.buzz/",
        "kind": "megaplay"
      }
    ],
    "mp4": [
      {
        "url": "https://ani.pm/api/anime/src/file?t=abc...",
        "proxied_url": "/api/proxy/m3u8?url=...",
        "referer": "https://ani.pm/"
      }
    ],
    "iframe": [
      {
        "url": "https://vidnest.fun/anime/...",
        "referer": "https://ani.pm/"
      },
      {
        "url": "https://megaplay.buzz/stream/s-2/12345/sub",
        "referer": "https://ani.pm/"
      }
    ]
  },

  "megaplay": {
    "embedUrl": "https://megaplay.buzz/stream/s-2/12345/sub",
    "variantType": "sub",
    "m3u8": "https://*.nekostream.site/master.m3u8",
    "proxied_m3u8": "/api/proxy/m3u8?url=...&referer=https%3A%2F%2Fmegaplay.buzz%2F",
    "subtitles": [
      { "url": "/api/proxy/m3u8?format=vtt&url=...", "lang": "English" }
    ],
    "intro": { "start": 5, "end": 85 },
    "outro": { "start": 1380, "end": 1440 }
  },

  "normalized": {
    "anilist_id": 6351,
    "episode": 1,
    "stream_type": "sub",
    "providers_scraped": [
      "Vega/file/sub",
      "Onyx/hls/sub",
      "Vidnest/embed/sub",
      "Vega/file/dub",
      "megaplay/hls"
    ],
    "cdn_hosts": [
      "ani.pm",
      "vidnest.fun",
      "*.nekostream.site",
      "megaplay.buzz"
    ],
    "source_counts": { "hls": 2, "mp4": 1, "iframe": 2, "total": 5 },
    "is_default": true
  }
}`}
            />
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* ENDPOINTS                                                         */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="search"
            method="GET"
            path="/api/scrape/search?q={query}&provider=anipm"
            title="Search ani.pm catalog"
            description="Search ani.pm's anime catalog by free-text query. Returns unified search results with anilistId and malId when ani.pm exposes them (most entries have both)."
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
                  description: "Must be 'anipm' for this provider.",
                },
              ]}
            />
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl "https://your-deployment.example.com/api/scrape/search?q=frieren&provider=anipm"`}
            />
            <CodeBlock
              language="json"
              label="200 OK (truncated)"
              code={`{
  "results": [
    {
      "id": "anipm:6351:frieren-beyond-journey-end",
      "anilistId": 154587,
      "malId": 52991,
      "title": {
        "english": "Frieren: Beyond Journey's End",
        "native": "葬送のフリーレン",
        "preferred": "Frieren: Beyond Journey's End"
      },
      "coverImage": { "large": "https://ani.pm/cdn/posters/..." },
      "year": 2023,
      "format": "TV",
      "genres": ["Adventure", "Drama", "Fantasy"],
      "totalEpisodes": 28
    }
  ],
  "provider": "anipm"
}`}
            />
          </EndpointCard>

          <EndpointCard
            id="info"
            method="GET"
            path="/api/scrape/info?id={animeId}&provider=anipm"
            title="Get anime info"
            description="Fetches the full ani.pm series document (GET /api/anime/series/{id}) and returns the unified metadata. Auto-enriched with AniList data when anilistId is exposed."
          >
            <ParamTable
              params={[
                {
                  name: "id",
                  type: "string",
                  required: true,
                  description: "anipm:{seriesId}:{slug}, anipm:{seriesId}, or al:{anilistId}.",
                },
                {
                  name: "provider",
                  type: "enum",
                  default: "animetsu",
                  description: "Must be 'anipm'.",
                },
                { name: "enrich", type: "0|1", default: "1", description: "Set to 0 to skip AniList enrichment." },
              ]}
            />
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl "https://your-deployment.example.com/api/scrape/info?id=al:154587&provider=anipm"`}
            />
          </EndpointCard>

          <EndpointCard
            id="episodes"
            method="GET"
            path="/api/scrape/episodes?id={animeId}&provider=anipm"
            title="Get episode list"
            description="Returns the full episode list from the ani.pm series document. Each episode's sourceId encodes the megaplay sub/dub embed URLs (used internally by /sources)."
          >
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl "https://your-deployment.example.com/api/scrape/episodes?id=al:154587&provider=anipm"`}
            />
            <CodeBlock
              language="json"
              label="200 OK (truncated)"
              code={`[
  {
    "number": 1,
    "displayNumber": "1",
    "sourceId": "6351|1|https://megaplay.buzz/stream/s-2/12345/sub|https://megaplay.buzz/stream/s-2/12345/dub",
    "title": "The Journey's End",
    "thumbnail": "https://ani.pm/cdn/episodes/...",
    "variants": ["sub", "dub"]
  }
]`}
            />
          </EndpointCard>

          <EndpointCard
            id="servers-endpoint"
            method="GET"
            path="/api/scrape/servers?id={animeId}&ep={episode}&provider=anipm"
            title="Get streaming servers"
            description="Enumerates the servers ani.pm exposes for the episode (via /api/anime/src/servers). Always includes 'megaplay' as a synthetic server because the series doc carries megaplay embed URLs for every episode."
          >
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl "https://your-deployment.example.com/api/scrape/servers?id=al:154587&ep=1&provider=anipm"`}
            />
            <CodeBlock
              language="json"
              label="200 OK"
              code={`[
  { "id": "vega-file-sub",   "label": "Vega SUB (file)",   "description": "Vega · file · sub",   "default": true },
  { "id": "onyx-hls-sub",    "label": "Onyx SUB (hls)",    "description": "Onyx · hls · sub" },
  { "id": "vidnest-embed-sub","label": "Vidnest SUB (embed)","description": "Vidnest · embed · sub" },
  { "id": "vega-file-dub",   "label": "Vega DUB (file)",   "description": "Vega · file · dub" },
  { "id": "megaplay",        "label": "MegaPlay",          "description": "megaplay.buzz HLS — same pipeline as the anilight provider" }
]`}
            />
          </EndpointCard>

          <EndpointCard
            id="sources"
            method="GET"
            path="/api/scrape/sources?id={animeId}&ep={episode}&server={server}&type={sub|dub}&provider=anipm"
            title="Get stream sources (ALL servers)"
            description="The main endpoint. Returns every server ani.pm exposes — HLS master playlists first, MP4 files second, iframe embeds last. Includes subtitles and intro/outro skip markers from MegaPlay. The raw field contains the full upstream payload (see Raw Payload Schema above)."
          >
            <ParamTable
              params={[
                { name: "id", type: "string", required: true, description: "anipm id or al:{anilistId}." },
                { name: "ep", type: "number", required: true, description: "Episode number (1-indexed)." },
                { name: "server", type: "string", default: "onyx-hls", description: "Server id from /servers (informational — all servers are returned regardless)." },
                { name: "type", type: "enum", default: "sub", description: "sub or dub. When dub is requested but unavailable, falls back to sub." },
                { name: "provider", type: "enum", default: "animetsu", description: "Must be 'anipm'." },
              ]}
            />
            <CodeTabs
              tabs={[
                {
                  label: "curl (AniList ID)",
                  code: `curl "https://your-deployment.example.com/api/scrape/sources?id=al:154587&ep=1&provider=anipm"`,
                },
                {
                  label: "curl (native ID)",
                  code: `curl "https://your-deployment.example.com/api/scrape/sources?id=anipm:6351:frieren-beyond-journey-end&ep=1&provider=anipm"`,
                },
              ]}
            />
            <CodeBlock
              language="json"
              label="200 OK (truncated — see Raw Payload Schema for full raw field)"
              code={`{
  "sources": [
    {
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fmegaplay.buzz%2F...master.m3u8&referer=https%3A%2F%2Fmegaplay.buzz%2F",
      "type": "master",
      "quality": "auto",
      "isMaster": true,
      "originalUrl": "https://*.nekostream.site/master.m3u8",
      "upstreamReferer": "https://megaplay.buzz/"
    },
    {
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fani.pm%2Fapi%2Fanime%2Fsrc%2Fhls%3Ft%3Ddef...&referer=https%3A%2F%2Fani.pm%2F",
      "type": "master",
      "quality": "auto",
      "isMaster": true,
      "originalUrl": "https://ani.pm/api/anime/src/hls?t=def...",
      "upstreamReferer": "https://ani.pm/"
    },
    {
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fani.pm%2Fapi%2Fanime%2Fsrc%2Ffile%3Ft%3Dabc...&referer=https%3A%2F%2Fani.pm%2F",
      "type": "mp4",
      "quality": "1080p",
      "originalUrl": "https://ani.pm/api/anime/src/file?t=abc...",
      "upstreamReferer": "https://ani.pm/"
    },
    {
      "url": "https://vidnest.fun/anime/...",
      "type": "iframe",
      "quality": "auto",
      "originalUrl": "https://vidnest.fun/anime/...",
      "upstreamReferer": "https://ani.pm/"
    }
  ],
  "subtitles": [
    { "url": "/api/proxy/m3u8?format=vtt&url=...", "lang": "English" }
  ],
  "skips": { "intro": { "start": 5, "end": 85 }, "outro": { "start": 1380, "end": 1440 } },
  "server": "onyx-hls",
  "provider": "anipm",
  "raw": { /* see Raw Payload Schema */ }
}`}
            />
          </EndpointCard>

          <EndpointCard
            id="raw"
            method="GET"
            path="/api/scrape/raw?id={animeId}&ep={episode}&provider=anipm"
            title="Get raw upstream payload only"
            description="Returns ONLY the raw upstream payload — the original JSON from ani.pm's API, before any normalization. Useful when you want to inspect exactly what ani.pm returned without the unified source wrapping. Does NOT probe the upstream servers — just records what ani.pm's API returned."
          >
            <CodeBlock
              language="bash"
              label="Request"
              code={`curl "https://your-deployment.example.com/api/scrape/raw?id=al:154587&ep=1&provider=anipm"`}
            />
            <p className="mt-3 text-sm text-zinc-500">
              Response shape:{" "}
              <code className="font-mono text-zinc-400">
                {"{ provider, animeId, requestedId, episode, server, streamType, raw, rawMulti, unified }"}
              </code>
              . The <code className="font-mono text-zinc-400">raw</code> field
              matches the schema documented in the Raw Payload Schema section
              above. The <code className="font-mono text-zinc-400">unified</code>{" "}
              field also includes the player-ready sources for convenience.
              For a DEEP scrape that actually probes every server URL, use{" "}
              <Link href="#anipm-raw" className="text-emerald-400 hover:underline">
                <code className="font-mono">/api/scrape/anipm-raw</code>
              </Link>{" "}
              instead.
            </p>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* DEEP RAW SCRAPE                                                   */}
          {/* ---------------------------------------------------------------- */}
          <EndpointCard
            id="anipm-raw"
            method="GET"
            path="/api/scrape/anipm-raw?id={animeId}&ep={episode}&type={sub|dub}"
            title="Deep raw scrape — probe EVERY server"
            description={
              <>
                The headline endpoint. For every server anipm exposes on the
                episode, we <strong className="text-zinc-200">actually fetch
                the upstream URL</strong> and return what came back. HLS
                playlists are pulled and parsed (variant count, segment count,
                total duration, raw m3u8 text), MP4 files are HEAD-probed for
                Content-Length + Accept-Ranges + Last-Modified, iframe URLs are
                recorded as-is. No &quot;if it plays or not&quot; gating, no
                iframe-only cop-out. Per user instruction:{" "}
                <em>&quot;make scrape that scrape all server raw data all
                server not iframe shit&quot;</em>.
              </>
            }
          >
            <ParamTable
              params={[
                {
                  name: "id",
                  type: "string",
                  required: true,
                  description: "anipm:{seriesId}:{slug}, anipm:{seriesId}, or al:{anilistId} (universal — resolved via title search).",
                },
                {
                  name: "ep",
                  type: "number",
                  required: true,
                  description: "Episode number (1-indexed).",
                },
                {
                  name: "type",
                  type: "enum",
                  default: "sub",
                  description: "sub or dub. When dub is requested but unavailable, falls back to sub for the megaplay variant.",
                },
                {
                  name: "server",
                  type: "string",
                  description: "Optional — accepted but ignored. We probe ALL servers regardless of this parameter.",
                },
              ]}
            />
            <CodeTabs
              tabs={[
                {
                  label: "curl (AniList ID)",
                  code: `curl "https://your-deployment.example.com/api/scrape/anipm-raw?id=al:154587&ep=1" | jq '.servers_grouped.counts'`,
                },
                {
                  label: "curl (native ID, dub)",
                  code: `curl "https://your-deployment.example.com/api/scrape/anipm-raw?id=anipm:6351:frieren-beyond-journey-s-end-c6fbj&ep=1&type=dub"`,
                },
                {
                  label: "JavaScript",
                  code: `const res = await fetch(
  "/api/scrape/anipm-raw?id=al:154587&ep=1"
);
const data = await res.json();

// Every server we probed, grouped by kind
for (const s of data.servers_grouped.hls) {
  console.log(\`HLS \${s.kind}: \${s.variant_count} variants, master=\${s.is_master}\`);
  console.log("  raw m3u8 (first 200 chars):", s.raw_m3u8?.slice(0, 200));
}
for (const s of data.servers_grouped.mp4) {
  console.log(\`MP4: \${(s.content_length / 1024 / 1024).toFixed(1)}MB, ranges=\${s.accept_ranges}\`);
}`,
                },
              ]}
            />

            <h4 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Per-server probe shape
            </h4>
            <p className="mb-3 text-sm text-zinc-400">
              Each entry in the <code className="font-mono text-emerald-400">servers</code>{" "}
              array has a different shape depending on its type. The common
              fields are <code className="font-mono text-zinc-300">index</code>,{" "}
              <code className="font-mono text-zinc-300">type</code>,{" "}
              <code className="font-mono text-zinc-300">kind</code>,{" "}
              <code className="font-mono text-zinc-300">url</code> (proxied),{" "}
              <code className="font-mono text-zinc-300">upstream_url</code>,{" "}
              <code className="font-mono text-zinc-300">upstream_referer</code>,{" "}
              <code className="font-mono text-zinc-300">quality</code>. The
              type-specific fields are:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Kind</th>
                    <th className="py-2 font-medium">Extra fields returned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  <tr>
                    <td className="py-2 pr-4 font-mono text-emerald-400">master</td>
                    <td className="py-2 pr-4 text-zinc-400">anipm-onyx-hls, megaplay-hls</td>
                    <td className="py-2 text-zinc-400">
                      <code className="font-mono text-xs">http_status, content_type, raw_m3u8, raw_m3u8_truncated, is_master, variant_count, segment_count, duration_seconds, first_variant_url, first_segment_url</code>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-emerald-400">mp4</td>
                    <td className="py-2 pr-4 text-zinc-400">file</td>
                    <td className="py-2 text-zinc-400">
                      <code className="font-mono text-xs">http_status, content_type, content_length, accept_ranges, last_modified, etag</code>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-emerald-400">iframe</td>
                    <td className="py-2 pr-4 text-zinc-400">iframe</td>
                    <td className="py-2 text-zinc-400">
                      <code className="font-mono text-xs">note</code> (iframe URLs are not probed server-side — the user&apos;s browser solves any Cloudflare challenge natively)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Response example (truncated)
            </h4>
            <CodeBlock
              language="json"
              label="200 OK — Frieren ep 1, sub"
              code={`{
  "provider": "anipm",
  "endpoint": "/api/scrape/anipm-raw",
  "description": "Deep raw scrape — every server probed, m3u8 content fetched, MP4 headers captured, iframe URLs recorded. Not just iframe shit.",
  "requestedId": "al:154587",
  "animeId": "anipm:6351:",
  "episode": 1,
  "streamType": "sub",
  "server": "auto",

  "servers": [
    {
      "index": 0,
      "type": "master",
      "kind": "megaplay-hls",
      "url": "/api/proxy/m3u8?url=https%3A%2F%2F9hjkrt.nekostream.site%2F...master.m3u8&referer=https%3A%2F%2Fmegaplay.buzz%2F",
      "upstream_url": "https://9hjkrt.nekostream.site/bb6d2babd7797d94d8f4a8600bc9b44e/.../master.m3u8",
      "upstream_referer": "https://megaplay.buzz/",
      "quality": "auto",
      "http_status": 200,
      "content_type": "application/vnd.apple.mpegurl",
      "raw_m3u8": "#EXTM3U\\n#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1800112,RESOLUTION=1920x1080,FRAME-RATE=25.000,CODECS=\\"avc1.640032,mp4a.40.2\\"\\nindex-f1-v1-a1.m3u8\\n#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=49071,...",
      "raw_m3u8_truncated": false,
      "is_master": true,
      "variant_count": 1,
      "segment_count": 0,
      "duration_seconds": null,
      "first_variant_url": "https://9hjkrt.nekostream.site/.../index-f1-v1-a1.m3u8",
      "first_segment_url": null
    },
    {
      "index": 1,
      "type": "master",
      "kind": "anipm-onyx-hls",
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fani.pm%2Fapi%2Fanime%2Fsrc%2Fhls%3Ft%3D...&referer=https%3A%2F%2Fani.pm%2F",
      "upstream_url": "https://ani.pm/api/anime/src/hls?t=0xfi2w1aVS37BzKE75nBnjxfUCPZEvN_6yPRZQjmRFfGARxKHBKcveX8BFZ",
      "upstream_referer": "https://ani.pm/",
      "http_status": 200,
      "content_type": "application/vnd.apple.mpegurl; charset=utf-8",
      "is_master": true,
      "variant_count": 3,
      "segment_count": 0,
      "first_variant_url": "https://ani.pm/api/anime/src/hls?t=4_oxzZk-6LniwRnaZuyX3VXmsDxH51vNLWz_B3CVa-LilSEZ1RP_pzQ"
    },
    {
      "index": 3,
      "type": "mp4",
      "kind": "file",
      "url": "/api/proxy/m3u8?url=https%3A%2F%2Fani.pm%2Fapi%2Fanime%2Fsrc%2Ffile%3Ft%3D...&referer=https%3A%2F%2Fani.pm%2F",
      "upstream_url": "https://ani.pm/api/anime/src/file?t=5snl9KU5Z5Wn5-tfNtRPKdxsHY4wdF6U1UVUlloyA-cQBYRmAiKc2BHTLt",
      "upstream_referer": "https://ani.pm/",
      "quality": "1080p",
      "http_status": 200,
      "content_type": "video/mp4",
      "content_length": 251568229,
      "accept_ranges": "bytes",
      "last_modified": "Mon, 15 Jan 2024 09:23:41 GMT",
      "etag": "\\"abc123\\""
    },
    {
      "index": 4,
      "type": "iframe",
      "kind": "iframe",
      "url": "https://vidnest.fun/anime/52991/1/sub",
      "upstream_url": "https://vidnest.fun/anime/52991/1/sub",
      "upstream_referer": "https://ani.pm/",
      "note": "iframe — browser solves Cloudflare challenge natively; not probed server-side"
    }
  ],

  "servers_grouped": {
    "hls":   [ /* ...3 entries... */ ],
    "mp4":   [ /* ...1 entry...  */ ],
    "iframe":[ /* ...2 entries.. */ ],
    "counts": { "hls": 3, "mp4": 1, "iframe": 2, "total": 6 }
  },

  "upstream_servers": {
    "sub": [
      { "provider": "Vega",   "kind": "file",  "url": "/api/anime/src/file?t=...",  "priority": 1 },
      { "provider": "Onyx",   "kind": "hls",   "url": "/api/anime/src/hls?t=...",   "priority": 2 },
      { "provider": "Vega",   "kind": "embed", "url": "https://vidnest.fun/anime/52991/1/sub" }
    ],
    "dub": [
      { "provider": "Onyx",   "kind": "hls",   "url": "/api/anime/src/hls?t=..." }
    ]
  },

  "megaplay": {
    "embedUrl": "https://megaplay.buzz/stream/s-2/107257/sub",
    "variantType": "sub",
    "m3u8": "https://9hjkrt.nekostream.site/.../master.m3u8",
    "proxied_m3u8": "/api/proxy/m3u8?url=...&referer=https%3A%2F%2Fmegaplay.buzz%2F",
    "subtitles": [ { "url": "/api/proxy/m3u8?format=vtt&url=...", "lang": "English" } ],
    "intro": { "start": 5, "end": 85 },
    "outro": { "start": 1380, "end": 1440 }
  },

  "subtitles": [ /* same as megaplay.subtitles */ ],
  "skips": { "intro": { "start": 5, "end": 85 }, "outro": { "start": 1380, "end": 1440 } },

  "unified_sources": [ /* same shape as /api/scrape/sources sources[] */ ],
  "api": {
    "series": "https://ani.pm/api/anime/series/6351",
    "servers": "https://ani.pm/api/anime/src/servers?title=frieren-beyond-journey-s-end-c6fbj&ep=1",
    "megaplay_variants": "https://megaplay.buzz/api/107257",
    "megaplay_sources": "https://megaplay.buzz/stream/getSourcesNew?id={episode_id}"
  }
}`}
            />

            <div className="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4 text-sm text-indigo-200">
              <strong className="font-semibold">Why this exists:</strong>{" "}
              The plain <code className="font-mono">/api/scrape/raw</code>{" "}
              endpoint returns the raw upstream payload, but it doesn&apos;t
              actually probe the server URLs — it just records what ani.pm&apos;s
              API returned. This endpoint goes one level deeper: for every HLS
              URL, we fetch the m3u8 and parse it. For every MP4 URL, we
              HEAD-probe it. So you can see at a glance &quot;this Onyx master
              has 3 variants (1080p, 720p, 360p)&quot; or &quot;this Vega MP4
              is 239MB and supports Range requests&quot; — without having to
              fetch each URL yourself.
            </div>
          </EndpointCard>

          {/* ---------------------------------------------------------------- */}
          {/* ENDPOINT COMPARISON                                               */}
          {/* ---------------------------------------------------------------- */}
          <section id="endpoint-comparison" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">
              Endpoint Comparison
            </h2>
            <p className="mb-4 text-zinc-400">
              Three endpoints touch stream data. Here&apos;s exactly what each
              one returns so you can pick the right one for your use case.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Endpoint</th>
                    <th className="py-2 pr-4 font-medium">Probes servers?</th>
                    <th className="py-2 pr-4 font-medium">Returns raw m3u8?</th>
                    <th className="py-2 pr-4 font-medium">Returns MP4 headers?</th>
                    <th className="py-2 font-medium">Best for</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  <tr>
                    <td className="py-2 pr-4 font-mono text-emerald-400">
                      <Link href="#sources" className="hover:underline">/api/scrape/sources</Link>
                    </td>
                    <td className="py-2 pr-4 text-zinc-500">No</td>
                    <td className="py-2 pr-4 text-zinc-500">No (URLs only)</td>
                    <td className="py-2 pr-4 text-zinc-500">No</td>
                    <td className="py-2 text-zinc-400">Player playback — returns proxied URLs ready for &lt;video&gt; / hls.js</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-emerald-400">
                      <Link href="#raw" className="hover:underline">/api/scrape/raw</Link>
                    </td>
                    <td className="py-2 pr-4 text-zinc-500">No</td>
                    <td className="py-2 pr-4 text-zinc-500">No (URLs only)</td>
                    <td className="py-2 pr-4 text-zinc-500">No</td>
                    <td className="py-2 text-zinc-400">Inspecting what ani.pm&apos;s API returned (server list, megaplay diagnostics)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-emerald-400">
                      <Link href="#anipm-raw" className="hover:underline">/api/scrape/anipm-raw</Link>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-400">YES</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-400">YES</span>
                    </td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-400">YES</span>
                    </td>
                    <td className="py-2 text-zinc-400">Deep inspection — every server actually fetched, m3u8 parsed, MP4 HEAD-probed</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
              <strong className="font-semibold">Latency note:</strong>{" "}
              <code className="font-mono">/sources</code> and{" "}
              <code className="font-mono">/raw</code> both complete in ~1-2s (one
              round-trip to ani.pm + megaplay).{" "}
              <code className="font-mono">/anipm-raw</code> takes ~3-6s because it
              fetches every HLS playlist + HEAD-probes every MP4 in parallel.
              Don&apos;t call it on every page load — call it once when you need
              to inspect what&apos;s available, then cache.
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* UPSTREAM API                                                      */}
          {/* ---------------------------------------------------------------- */}
          <section id="upstream-api" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">Upstream API</h2>
            <p className="mb-4 text-zinc-400">
              The provider wraps these ani.pm REST endpoints. All are
              Cloudflare-fronted GET requests; the provider uses curl with
              full browser headers (Sec-Ch-Ua, Sec-Fetch-*, Origin) to bypass
              the managed challenge.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-800 text-zinc-400">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Endpoint</th>
                    <th className="py-2 pr-4 font-medium">Purpose</th>
                    <th className="py-2 font-medium">Returns</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  <tr>
                    <td className="py-2 pr-4 font-mono text-indigo-400">/api/anime/search?q=</td>
                    <td className="py-2 pr-4">Search catalog</td>
                    <td className="py-2 text-zinc-400">{`{ items: AnipmSearchItem[] }`}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-indigo-400">/api/anime/series/{`{id}`}</td>
                    <td className="py-2 pr-4">Full anime doc</td>
                    <td className="py-2 text-zinc-400">AnipmSeries (incl. episodes[])</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-indigo-400">/api/anime/src/servers?title={`{slug}`}&ep={`{n}`}</td>
                    <td className="py-2 pr-4">Enumerate servers</td>
                    <td className="py-2 text-zinc-400">{`{ sub: [...], dub: [...] }`}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-indigo-400">/api/anime/src/hls?t=</td>
                    <td className="py-2 pr-4">Onyx HLS master</td>
                    <td className="py-2 text-zinc-400">m3u8 (relative URIs!)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-indigo-400">/api/anime/src/file?t=</td>
                    <td className="py-2 pr-4">Vega MP4 file</td>
                    <td className="py-2 text-zinc-400">251MB MP4 (Range-supported)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-rose-400">megaplay.buzz/api/{`{realid}`}</td>
                    <td className="py-2 pr-4">MegaPlay variants</td>
                    <td className="py-2 text-zinc-400">{`{ success, data: MegaplayVariant[] }`}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-rose-400">megaplay.buzz/stream/getSourcesNew?id=</td>
                    <td className="py-2 pr-4">MegaPlay HLS + subs + skips</td>
                    <td className="py-2 text-zinc-400">{`{ sources: {file}, tracks, intro, outro }`}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* CDN HOSTS                                                         */}
          {/* ---------------------------------------------------------------- */}
          <section id="cdn-hosts" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">CDN Hosts</h2>
            <p className="mb-4 text-zinc-400">
              The provider touches these CDN hosts. All non-iframe URLs are
              wrapped through the{" "}
              <Link href="/docs#proxy" className="text-indigo-400 hover:underline">
                CORS proxy
              </Link>{" "}
              with the appropriate Referer header.
            </p>
            <div className="space-y-2">
              <CdnHost host="ani.pm" purpose="API + Vega MP4 + Onyx HLS" referer="https://ani.pm/" />
              <CdnHost host="vidnest.fun" purpose="Vidnest iframe embeds" referer="(passthrough — browser solves challenge)" />
              <CdnHost host="megaplay.buzz" purpose="MegaPlay API" referer="https://ani.pm/" />
              <CdnHost host="*.nekostream.site" purpose="MegaPlay HLS m3u8 + variant segments" referer="https://megaplay.buzz/" />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* CLOUDFLARE BYPASS                                                 */}
          {/* ---------------------------------------------------------------- */}
          <section id="cloudflare" className="scroll-mt-20 py-10">
            <h2 className="mb-3 text-2xl font-bold text-white">
              Cloudflare Bypass
            </h2>
            <p className="mb-4 text-zinc-400">
              Ani.pm is fully behind Cloudflare&apos;s managed challenge.
              Node&apos;s undici (used by{" "}
              <code className="font-mono text-zinc-400">fetch()</code>) gets a 403
              on the series/{`{id}`} and src/hls endpoints due to TLS
              fingerprinting. The provider works around this by shelling out
              to <code className="font-mono text-zinc-400">curl</code> with the
              full browser header set:
            </p>
            <CodeBlock
              language="bash"
              label="The exact curl invocation used internally"
              code={`curl -sSL \\
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" \\
  -H "Referer: https://ani.pm/" \\
  -H "Origin: https://ani.pm" \\
  -H "Accept: application/json,text/plain,*/*;q=0.8" \\
  -H "Accept-Language: en-US,en;q=0.9" \\
  -H 'Sec-Ch-Ua: "Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"' \\
  -H "Sec-Ch-Ua-Mobile: ?0" \\
  -H 'Sec-Ch-Ua-Platform: "Windows"' \\
  -H "Sec-Fetch-Dest: empty" \\
  -H "Sec-Fetch-Mode: cors" \\
  -H "Sec-Fetch-Site: same-origin" \\
  --http2 \\
  --max-time 20 \\
  "https://ani.pm/api/anime/series/6351"`}
            />
            <p className="mt-3 text-sm text-zinc-500">
              The MegaPlay endpoints (megaplay.buzz/api/* and megaplay.buzz/stream/getSourcesNew)
              do <strong>not</strong> need curl — Node&apos;s fetch works fine
              because Cloudflare doesn&apos;t challenge megaplay.buzz&apos;s CDN.
              The provider uses fetch for those, which is faster.
            </p>
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

function ServerTypeCard({
  name,
  kind,
  type,
  color,
  description,
  upstreamUrl,
}: {
  name: string;
  kind: string;
  type: string;
  color: "emerald" | "indigo" | "amber" | "rose";
  description: string;
  upstreamUrl: string;
}) {
  const colorClasses = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    indigo: "border-indigo-500/30 bg-indigo-500/5 text-indigo-300",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-300",
    rose: "border-rose-500/30 bg-rose-500/5 text-rose-300",
  }[color];
  return (
    <div className={`rounded-lg border p-4 ${colorClasses}`}>
      <div className="mb-2 flex items-center gap-3">
        <span className="text-lg font-bold">{name}</span>
        <span className="rounded bg-zinc-800/60 px-2 py-0.5 font-mono text-xs text-zinc-300">
          kind: {kind}
        </span>
        <span className="rounded bg-zinc-800/60 px-2 py-0.5 font-mono text-xs text-zinc-300">
          type: {type}
        </span>
      </div>
      <p className="mb-2 text-sm text-zinc-300">{description}</p>
      <div className="text-xs text-zinc-400">
        Upstream:{" "}
        <code className="font-mono text-zinc-200">{upstreamUrl}</code>
      </div>
    </div>
  );
}

function CdnHost({ host, purpose, referer }: { host: string; purpose: string; referer: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <code className="shrink-0 font-mono text-sm text-indigo-400">{host}</code>
      <div className="min-w-0 flex-1 text-sm text-zinc-300">{purpose}</div>
      <div className="shrink-0 text-xs text-zinc-500">
        Referer: <code className="font-mono text-zinc-400">{referer}</code>
      </div>
    </div>
  );
}
