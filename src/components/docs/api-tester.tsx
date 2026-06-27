"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, RotateCcw, Send, Film, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CodeBlock } from "@/components/docs/code-block";
import {
  MediaPlayer,
  type Quality,
  type Subtitle,
  type SkipMarkers,
  type StreamSource,
} from "@/components/animetsu/media-player";

/* ------------------------------------------------------------------ */
/*  Endpoint catalog — what the tester knows how to call              */
/* ------------------------------------------------------------------ */

type FieldKind = "string" | "number" | "enum";

interface Field {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  default?: string;
  placeholder?: string;
  options?: string[];
  /**
   * When true, this field's options are fetched dynamically from
   * /api/scrape/providers instead of being hardcoded in `options`.
   * Used for the `provider` field on every endpoint that takes one.
   */
  dynamicProviders?: boolean;
  /** Hide this field unless this endpoint is /sources (it's only used there) */
  onlyForSources?: boolean;
}

interface EndpointDef {
  id: string;
  label: string;
  method: "GET";
  path: string;
  description: string;
  fields: Field[];
  /** When true, hitting Send will also spawn a MediaPlayer below the response */
  launchesPlayer?: boolean;
}

/**
 * Static fallback list — used until /api/scrape/providers resolves.
 * Updated to include every provider: animetsu, anikuro, animeyubi,
 * miruro, animex, anilight, anipm.
 */
const PROVIDER_OPTIONS = [
  "animetsu",
  "anikuro",
  "animeyubi",
  "miruro",
  "animex",
  "anilight",
  "anipm",
];

const ENDPOINTS: EndpointDef[] = [
  {
    id: "providers",
    label: "List Providers",
    method: "GET",
    path: "/api/scrape/providers",
    description: "Returns the metadata for every registered provider.",
    fields: [],
  },
  {
    id: "search",
    label: "Search",
    method: "GET",
    path: "/api/scrape/search",
    description: "Search a provider's catalog by free-text query.",
    fields: [
      { name: "q", label: "Query", kind: "string", required: true, placeholder: "frieren" },
      {
        name: "provider",
        label: "Provider",
        kind: "enum",
        default: "animetsu",
        dynamicProviders: true,
      },
    ],
  },
  {
    id: "info",
    label: "Anime Info",
    method: "GET",
    path: "/api/scrape/info",
    description: "Get full metadata for a single anime, optionally enriched with AniList data.",
    fields: [
      { name: "id", label: "Anime ID", kind: "string", required: true, placeholder: "14682 or al:154587 or anipm:6351:slug" },
      {
        name: "provider",
        label: "Provider",
        kind: "enum",
        default: "animetsu",
        dynamicProviders: true,
      },
      { name: "enrich", label: "Enrich (0 or 1)", kind: "string", default: "1", placeholder: "1" },
    ],
  },
  {
    id: "episodes",
    label: "Episodes",
    method: "GET",
    path: "/api/scrape/episodes",
    description: "Get the full episode list for an anime.",
    fields: [
      { name: "id", label: "Anime ID", kind: "string", required: true, placeholder: "14682 or al:154587 or anipm:6351:slug" },
      {
        name: "provider",
        label: "Provider",
        kind: "enum",
        default: "animetsu",
        dynamicProviders: true,
      },
    ],
  },
  {
    id: "servers",
    label: "Servers",
    method: "GET",
    path: "/api/scrape/servers",
    description: "Get available streaming servers for an episode.",
    fields: [
      { name: "id", label: "Anime ID", kind: "string", required: true, placeholder: "14682 or al:154587 or anipm:6351:slug" },
      { name: "ep", label: "Episode", kind: "number", required: true, placeholder: "1" },
      {
        name: "provider",
        label: "Provider",
        kind: "enum",
        default: "animetsu",
        dynamicProviders: true,
      },
    ],
  },
  {
    id: "sources",
    label: "Stream Sources",
    method: "GET",
    path: "/api/scrape/sources",
    description:
      "Resolve playable stream URLs (m3u8 + mp4 + iframe). The response feeds straight into the player below.",
    fields: [
      { name: "id", label: "Anime ID", kind: "string", required: true, placeholder: "14682 or al:154587 or anipm:6351:slug" },
      { name: "ep", label: "Episode", kind: "number", required: true, placeholder: "1" },
      { name: "server", label: "Server", kind: "string", placeholder: "(leave blank for default)" },
      {
        name: "type",
        label: "Audio",
        kind: "enum",
        default: "sub",
        options: ["sub", "dub"],
      },
      {
        name: "provider",
        label: "Provider",
        kind: "enum",
        default: "animetsu",
        dynamicProviders: true,
      },
    ],
    launchesPlayer: true,
  },
  {
    id: "raw",
    label: "Raw Upstream",
    method: "GET",
    path: "/api/scrape/raw",
    description: "Get the raw upstream JSON the provider returned, before normalization. Includes every server scraped.",
    fields: [
      { name: "id", label: "Anime ID", kind: "string", required: true, placeholder: "14682 or al:154587 or anipm:6351:slug" },
      { name: "ep", label: "Episode", kind: "number", required: true, placeholder: "1" },
      { name: "server", label: "Server", kind: "string", placeholder: "(optional)" },
      {
        name: "type",
        label: "Audio",
        kind: "enum",
        default: "sub",
        options: ["sub", "dub"],
      },
      {
        name: "provider",
        label: "Provider",
        kind: "enum",
        default: "animetsu",
        dynamicProviders: true,
      },
    ],
  },
  {
    id: "recent",
    label: "Recent Releases",
    method: "GET",
    path: "/api/scrape/recent",
    description: "Get the most recently added anime (animetsu upstream only).",
    fields: [
      { name: "page", label: "Page", kind: "number", default: "1", placeholder: "1" },
      { name: "per_page", label: "Per page", kind: "number", default: "20", placeholder: "20" },
    ],
  },
  {
    id: "anilist",
    label: "AniList",
    method: "GET",
    path: "/api/scrape/anilist",
    description: "Direct AniList passthrough. Provide exactly one of id / search / trending.",
    fields: [
      { name: "id", label: "AniList ID", kind: "number", placeholder: "154587" },
      { name: "search", label: "Search query", kind: "string", placeholder: "frieren" },
      { name: "trending", label: "Trending (1)", kind: "string", placeholder: "1" },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Player sources payload shape                                       */
/* ------------------------------------------------------------------ */

interface SourcesPayload {
  sources: StreamSource[];
  subtitles: Subtitle[];
  skips?: SkipMarkers;
  server: string;
  provider: string;
  qualities?: Quality[];
  raw?: unknown;
  rawMulti?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ApiTester() {
  const [endpointId, setEndpointId] = useState<string>("sources");
  const endpoint = useMemo(
    () => ENDPOINTS.find((e) => e.id === endpointId)!,
    [endpointId]
  );

  // Initialize field values when endpoint changes
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const init: Record<string, string> = {};
    for (const f of endpoint.fields) init[f.name] = f.default ?? "";
    setValues(init);
  }, [endpoint]);

  // ---------------------------------------------------------------
  // Fetch provider list once on mount so every endpoint's `provider`
  // dropdown is always in sync with what's actually registered on
  // the server. Falls back to PROVIDER_OPTIONS if the fetch fails.
  // ---------------------------------------------------------------
  const [providers, setProviders] = useState<string[]>(PROVIDER_OPTIONS);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/scrape/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const list = Array.isArray(d?.providers)
          ? d.providers.map((p: { id: string }) => p.id).filter(Boolean)
          : null;
        if (list && list.length > 0) setProviders(list as string[]);
      })
      .catch(() => {
        /* keep fallback list */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [url, setUrl] = useState<string>("");
  const [durationMs, setDurationMs] = useState<number | null>(null);

  // Player state — only used when endpoint.launchesPlayer is true
  const [playerSource, setPlayerSource] = useState<StreamSource | undefined>(undefined);
  const [playerQualities, setPlayerQualities] = useState<Quality[]>([]);
  const [playerSubtitles, setPlayerSubtitles] = useState<Subtitle[]>([]);
  const [playerSkips, setPlayerSkips] = useState<SkipMarkers | undefined>(undefined);
  const [playerTitle, setPlayerTitle] = useState<string>("");

  function buildUrl(): string {
    const params = new URLSearchParams();
    for (const f of endpoint.fields) {
      const v = (values[f.name] ?? "").trim();
      if (v) params.set(f.name, v);
    }
    const qs = params.toString();
    return qs ? `${endpoint.path}?${qs}` : endpoint.path;
  }

  function validate(): string | null {
    for (const f of endpoint.fields) {
      if (f.required && !(values[f.name] ?? "").trim()) {
        return `Missing required field: ${f.label}`;
      }
    }
    return null;
  }

  async function send() {
    const err = validate();
    if (err) {
      setError(err);
      setResponse(null);
      setStatus(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResponse(null);
    setPlayerSource(undefined);
    setPlayerQualities([]);
    setPlayerSubtitles([]);
    setPlayerSkips(undefined);

    const fullUrl = buildUrl();
    setUrl(fullUrl);
    const t0 = performance.now();
    try {
      const res = await fetch(fullUrl);
      setStatus(res.status);
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      setResponse(parsed);
      setDurationMs(Math.round(performance.now() - t0));

      // If this is the sources endpoint and we got a successful payload,
      // spin up the player with the master source (or first available).
      if (endpoint.launchesPlayer && res.ok && parsed && typeof parsed === "object") {
        const payload = parsed as SourcesPayload;
        if (Array.isArray(payload.sources) && payload.sources.length > 0) {
          // Prefer master, then HLS, then MP4, then iframe
          const pick =
            payload.sources.find((s) => s.type === "master") ||
            payload.sources.find((s) => s.type === "hls") ||
            payload.sources.find((s) => s.type === "mp4") ||
            payload.sources[0];
          setPlayerSource(pick);
          setPlayerQualities(payload.qualities ?? []);
          setPlayerSubtitles(payload.subtitles ?? []);
          setPlayerSkips(payload.skips);
          // Title for the player overlay
          const providerLabel = payload.provider || endpointId;
          setPlayerTitle(
            `Episode ${values.ep ?? "?"} · ${values.server || payload.server || "default"} · ${values.type || "sub"} · ${providerLabel}`
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setDurationMs(Math.round(performance.now() - t0));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    const init: Record<string, string> = {};
    for (const f of endpoint.fields) init[f.name] = f.default ?? "";
    setValues(init);
    setResponse(null);
    setError(null);
    setStatus(null);
    setUrl("");
    setDurationMs(null);
    setPlayerSource(undefined);
    setPlayerQualities([]);
    setPlayerSubtitles([]);
    setPlayerSkips(undefined);
  }

  const responseJson = useMemo(
    () => (response === null ? "" : JSON.stringify(response, null, 2)),
    [response]
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Try it live</h3>
            <p className="text-xs text-zinc-500">
              Fire real requests against this deployment and inspect the response inline.
            </p>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
            Interactive
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        {/* ------------------------------ */}
        {/*  Left: request builder         */}
        {/* ------------------------------ */}
        <div>
          {/* Endpoint picker */}
          <div className="mb-4">
            <Label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Endpoint
            </Label>
            <Select value={endpointId} onValueChange={setEndpointId}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENDPOINTS.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label} — {e.method} {e.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-xs text-zinc-500">{endpoint.description}</p>
          </div>

          {/* Method + URL preview */}
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
            <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-xs font-bold text-emerald-400">
              {endpoint.method}
            </span>
            <code className="flex-1 break-all font-mono text-xs text-zinc-300">
              {url || buildUrl()}
            </code>
          </div>

          {/* Dynamic fields */}
          {endpoint.fields.length === 0 ? (
            <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-500">
              No parameters — just hit Send.
            </div>
          ) : (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              {endpoint.fields.map((f) => (
                <div key={f.name} className={f.kind === "string" && f.name.length > 6 ? "sm:col-span-2" : ""}>
                  <Label className="mb-1.5 block text-xs font-medium text-zinc-400">
                    {f.label}
                    {f.required && <span className="ml-1 text-rose-400">*</span>}
                    {!f.required && (
                      <span className="ml-1 text-zinc-600">optional</span>
                    )}
                  </Label>
                  {f.kind === "enum" && (f.options || f.dynamicProviders) ? (
                    <Select
                      value={values[f.name] ?? ""}
                      onValueChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
                    >
                      <SelectTrigger className="bg-zinc-950 border-zinc-800">
                        <SelectValue placeholder={f.placeholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {(f.dynamicProviders ? providers : f.options || []).map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={values[f.name] ?? ""}
                      onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="bg-zinc-950 border-zinc-800 font-mono text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              onClick={send}
              disabled={loading}
              className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Request
                </>
              )}
            </Button>
            <Button
              onClick={reset}
              variant="outline"
              className="border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-800"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset
            </Button>
          </div>

          {/* Quick examples for the sources endpoint */}
          {endpoint.launchesPlayer && (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
              <div className="mb-1.5 font-medium text-zinc-300">Quick examples:</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Frieren · animetsu · ep 1", values: { id: "6989b8a029cf95f4eb03b500", ep: "1", server: "kite", type: "sub", provider: "animetsu" } },
                  { label: "Frieren · animeyubi · ep 1", values: { id: "", ep: "1", server: "kwik-mp4", type: "sub", provider: "animeyubi" } },
                  { label: "Frieren · miruro · ep 1", values: { id: "al:154587", ep: "1", server: "pewe", type: "sub", provider: "miruro" } },
                  { label: "Slime S4 · animex · ep 1", values: { id: "al:182205", ep: "1", server: "flixcloud", type: "sub", provider: "animex" } },
                  { label: "Frieren · anilight · ep 1", values: { id: "al:154587:sousou-no-frieren", ep: "1", server: "megaplay", type: "sub", provider: "anilight" } },
                  { label: "Frieren · anipm · ep 1", values: { id: "anipm:6351:frieren-beyond-journey-s-end-c6fbj", ep: "1", server: "megaplay", type: "sub", provider: "anipm" } },
                ].map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => setValues((s) => ({ ...s, ...ex.values }))}
                    className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                Note: anime IDs differ per provider. Search first to find the right ID for your chosen provider.
                animetsu uses Mongo ObjectIds; miruro/animex use <code>al:{"{anilistId}"}</code>; anilight uses
                <code> al:{"{anilistId}"}:{"{slug}"}</code>; anipm uses <code>anipm:{"{seriesId}"}:{"{slug}"}</code>.
              </p>
            </div>
          )}
        </div>

        {/* ------------------------------ */}
        {/*  Right: response viewer         */}
        {/* ------------------------------ */}
        <div>
          {/* Status line */}
          <div className="mb-3 flex items-center gap-3 text-xs">
            {status !== null && (
              <span
                className={`rounded-md px-2 py-0.5 font-mono font-bold ${
                  status >= 200 && status < 300
                    ? "bg-emerald-500/15 text-emerald-400"
                    : status >= 400 && status < 500
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {status}
              </span>
            )}
            {durationMs !== null && (
              <span className="text-zinc-500">{durationMs}ms</span>
            )}
            {loading && (
              <span className="flex items-center gap-1 text-zinc-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                fetching…
              </span>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Request failed</div>
                <div className="mt-0.5 text-rose-200/80">{error}</div>
              </div>
            </div>
          )}

          {/* Player (only for /sources) */}
          {endpoint.launchesPlayer && playerSource && (
            <div className="mb-4 overflow-hidden rounded-lg border border-emerald-500/30 bg-zinc-950">
              <div className="flex items-center gap-2 border-b border-zinc-800 bg-emerald-500/5 px-3 py-2">
                <Play className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs font-medium text-emerald-300">
                  Live player — stream resolved successfully
                </span>
              </div>
              <MediaPlayer
                source={playerSource}
                qualities={playerQualities}
                subtitles={playerSubtitles}
                skips={playerSkips}
                title={playerTitle}
                className="aspect-video w-full"
              />
            </div>
          )}

          {/* Player placeholder when sources endpoint was called but no sources came back */}
          {endpoint.launchesPlayer && !playerSource && response !== null && !error && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-500">
              <Film className="h-4 w-4" />
              No playable sources in the response — check the JSON below to debug.
            </div>
          )}

          {/* JSON response */}
          {response !== null && !error ? (
            <CodeBlock
              language="json"
              label="Response body"
              code={responseJson}
            />
          ) : (
            !error && (
              <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 text-sm text-zinc-600">
                Response will appear here after you hit Send.
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
