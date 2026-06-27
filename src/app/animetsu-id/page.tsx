"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  Search,
  Loader2,
  Copy,
  Check,
  ArrowLeft,
  ExternalLink,
  Hash,
  Database,
  Sparkles,
  AlertCircle,
  BookOpen,
  Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Strategy = "passthrough" | "title-search" | "cache-hit";

interface ResolveResult {
  nativeId: string;
  anilistId: number;
  provider: string;
  matchedTitle?: string;
  strategy: Strategy;
  triedTitles?: string[];
}

interface AnilistMedia {
  id: number;
  idMal?: number;
  title: { romaji?: string; english?: string; native?: string };
  synonyms?: string[];
  coverImage?: { large?: string; medium?: string; color?: string };
  seasonYear?: number;
  format?: string;
}

/** Single-provider response from /api/scrape/find-id */
interface SingleProviderResponse {
  anilistId: number;
  provider: string;
  anilist: AnilistMedia;
  resolved: ResolveResult;
  nativeId: string;
  universalId: string;
  sourcesUrl: string;
  universalSourcesUrl: string;
}

/** Per-provider entry in the all-providers response */
interface ProviderEntry {
  resolved: ResolveResult;
  nativeId: string;
  universalId: string;
  sourcesUrl: string;
  universalSourcesUrl: string;
  label: string;
}

/** All-providers response from /api/scrape/find-id (no provider param) */
interface AllProvidersResponse {
  anilistId: number;
  anilist: AnilistMedia;
  providers: Record<string, ProviderEntry | null>;
  availableCount: number;
  bestProvider: string | null;
  universalId: string;
}

interface ErrorResponse {
  error: string;
  anilistId?: number;
  provider?: string;
  anilist?: AnilistMedia;
  triedTitles?: string[];
}

/* ------------------------------------------------------------------ */
/*  Provider registry (matches src/lib/providers/index.ts)             */
/* ------------------------------------------------------------------ */

const PROVIDERS = [
  { id: "all",      label: "All Providers",   accent: "from-emerald-500 to-sky-500",     hint: "Resolve across every provider in parallel" },
  { id: "animetsu", label: "Animetsu",        accent: "from-rose-500 to-orange-500",     hint: "Mongo ObjectId (24 chars)" },
  { id: "anikuro",  label: "Anikuro",         accent: "from-violet-500 to-fuchsia-500",  hint: "Numeric id" },
  { id: "animeyubi",label: "Animeyubi",       accent: "from-emerald-500 to-teal-500",    hint: "Numeric id" },
  { id: "miruro",   label: "Miruro",          accent: "from-sky-500 to-indigo-500",      hint: "AniList-native (al:{id})" },
  { id: "animex",   label: "Animex",          accent: "from-pink-500 to-rose-500",       hint: "AniList-native (al:{id})" },
  { id: "anilight", label: "Anilight",        accent: "from-amber-500 to-orange-500",    hint: "al:{id}:{slug}" },
  { id: "anipm",    label: "Ani.pm",          accent: "from-indigo-500 to-violet-500",   hint: "anipm:{seriesId}:{slug}" },
  { id: "mkissa",   label: "MKissa",          accent: "from-blue-500 to-cyan-500",       hint: "AllAnime Mongo ID" },
  { id: "animedunya", label: "AnimeDunya",    accent: "from-emerald-500 to-teal-600",    hint: "Slug-based" },
  { id: "animekhor", label: "AnimeKhor",      accent: "from-amber-500 to-orange-600",    hint: "Slug-based (Donghua)" },
  { id: "onisaga",   label: "OniSaga",        accent: "from-red-600 to-orange-500",      hint: "Manga · Slug-based" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function IdFinderPage() {
  const [anilistInput, setAnilistInput] = useState("");
  const [provider, setProvider] = useState<ProviderId>("all");
  const [loading, setLoading] = useState(false);
  const [single, setSingle] = useState<SingleProviderResponse | null>(null);
  const [all, setAll] = useState<AllProvidersResponse | null>(null);
  const [error, setError] = useState<ErrorResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    const trimmed = anilistInput.trim();
    if (!trimmed) return;
    const digits = trimmed.match(/(\d+)/)?.[1];
    if (!digits) {
      setError({ error: "Please enter a numeric AniList ID (e.g. 154587)." });
      setSingle(null);
      setAll(null);
      return;
    }
    setLoading(true);
    setError(null);
    setSingle(null);
    setAll(null);
    try {
      const url =
        provider === "all"
          ? `/api/scrape/find-id?anilist=${digits}`
          : `/api/scrape/find-id?anilist=${digits}&provider=${provider}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data as ErrorResponse);
      } else if (provider === "all") {
        setAll(data as AllProvidersResponse);
      } else {
        setSingle(data as SingleProviderResponse);
      }
    } catch (err) {
      setError({
        error: err instanceof Error ? err.message : "Network error.",
      });
    } finally {
      setLoading(false);
    }
  }, [anilistInput, provider]);

  const copy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 text-zinc-200 hover:text-white"
            >
              <span className="text-lg">◆</span>
              <span className="font-semibold">Animetsu Scraper</span>
            </Link>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
              ID Finder
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/docs/id-finder"
              className="flex items-center gap-1.5 text-zinc-400 transition-colors hover:text-zinc-200"
            >
              <BookOpen className="h-4 w-4" />
              Docs
            </Link>
            <Link
              href="/"
              className="rounded-md border border-zinc-800 px-3 py-1.5 text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Live Demo →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* Hero */}
        <div className="mb-8">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to scraper
          </Link>
          <h1 className="mb-3 text-4xl font-bold text-white">
            Anime ID Finder
          </h1>
          <p className="max-w-2xl text-zinc-400">
            Enter an AniList ID and pick a provider — get back that
            provider&apos;s native id (Mongo ObjectId, numeric, slug, etc.)
            plus a ready-to-use{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-emerald-400">
              /sources
            </code>{" "}
            URL. Pick &quot;All Providers&quot; to resolve across every
            provider in parallel and see which ones have the anime.
          </p>
        </div>

        {/* Lookup card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                AniList ID
              </label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={anilistInput}
                  onChange={(e) => setAnilistInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") lookup();
                  }}
                  placeholder="154587  (Frieren)  —  or paste an anilist.co/anime/154587 URL"
                  className="border-zinc-700 bg-zinc-950 pl-10 font-mono text-base text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Provider
              </label>
              <Select value={provider} onValueChange={(v) => setProvider(v as ProviderId)}>
                <SelectTrigger className="border-zinc-700 bg-zinc-950 font-mono text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900">
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="font-mono">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500">
              {PROVIDERS.find((p) => p.id === provider)?.hint}
            </p>
            <Button
              onClick={lookup}
              disabled={loading || !anilistInput.trim()}
              className="bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resolving
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Find ID
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Single-provider result */}
        {single && <SingleProviderResult data={single} copy={copy} copied={copied} />}

        {/* All-providers result */}
        {all && <AllProvidersResult data={all} copy={copy} copied={copied} />}

        {/* Error */}
        {error && (
          <div className="mt-6 overflow-hidden rounded-xl border border-rose-500/30 bg-rose-500/5">
            <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3">
              <div className="flex items-center gap-2 text-rose-300">
                <AlertCircle className="h-4 w-4" />
                <span className="font-semibold">Could not resolve</span>
                {error.provider && (
                  <Badge
                    variant="outline"
                    className="ml-2 border-rose-500/30 text-rose-400"
                  >
                    {error.provider}
                  </Badge>
                )}
              </div>
            </div>
            <div className="p-6">
              <p className="mb-3 text-sm text-zinc-300">{error.error}</p>
              {error.anilist && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-sm">
                  <div className="mb-2 text-zinc-300">
                    AniList did find this ID:
                  </div>
                  <div className="mb-1 font-semibold text-white">
                    {error.anilist.title?.english ||
                      error.anilist.title?.romaji}
                  </div>
                  {error.anilist.seasonYear && (
                    <div className="text-xs text-zinc-500">
                      {error.anilist.seasonYear} · {error.anilist.format}
                    </div>
                  )}
                </div>
              )}
              {error.triedTitles && error.triedTitles.length > 0 && (
                <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Titles we tried
                  </div>
                  <ol className="space-y-1 text-sm text-zinc-400">
                    {error.triedTitles.map((t, i) => (
                      <li key={i}>
                        {i + 1}. {t}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick examples */}
        {!single && !all && !error && !loading && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Try these popular AniList IDs
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => {
                    setAnilistInput(String(ex.id));
                    setTimeout(() => lookup(), 50);
                  }}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-left transition-colors hover:border-emerald-500/40 hover:bg-zinc-900/80"
                >
                  <div>
                    <div className="text-sm font-medium text-zinc-200">
                      {ex.title}
                    </div>
                    <div className="text-xs text-zinc-500">
                      AniList: {ex.id}
                    </div>
                  </div>
                  <Search className="h-4 w-4 text-zinc-500" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="mt-12 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <h2 className="mb-3 text-lg font-semibold text-white">How it works</h2>
          <ol className="space-y-3 text-sm text-zinc-400">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                1
              </span>
              <div>
                <strong className="text-zinc-200">You provide an AniList ID</strong>{" "}
                and pick a provider (or &quot;All Providers&quot;).
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                2
              </span>
              <div>
                <strong className="text-zinc-200">
                  We fetch the AniList media document
                </strong>{" "}
                and collect every candidate title: english, romaji, native
                (Japanese), and any synonyms AniList knows about.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                3
              </span>
              <div>
                <strong className="text-zinc-200">
                  We search the provider&apos;s catalog
                </strong>{" "}
                with each title in priority order until we get a hit. For
                AniList-native providers (miruro, animex, anilight), the
                universal id <code className="font-mono text-zinc-300">al:{"{id}"}</code> is
                passed straight through with zero overhead.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-400">
                4
              </span>
              <div>
                <strong className="text-zinc-200">
                  The native id is returned
                </strong>{" "}
                along with a ready-to-use{" "}
                <code className="font-mono text-zinc-300">/sources</code> URL
                and the universal <code className="font-mono text-zinc-300">al:{"{anilistId}"}</code> form.
              </div>
            </li>
          </ol>
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
            <strong className="font-semibold">Pro tip:</strong> You don&apos;t
            actually need this tool to use the API. Every endpoint already
            accepts the universal id{" "}
            <code className="font-mono">al:{"{anilistId}"}</code> and resolves
            it automatically. This tool exists for when you want to see the
            underlying native id explicitly — for debugging, caching, or
            passing to a non-API consumer.
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SingleProviderResult({
  data,
  copy,
  copied,
}: {
  data: SingleProviderResponse;
  copy: (text: string, key: string) => void;
  copied: string | null;
}) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5">
      <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-6 py-3">
        <div className="flex items-center gap-2 text-emerald-300">
          <Sparkles className="h-4 w-4" />
          <span className="font-semibold">Resolved on {data.provider}</span>
          <Badge
            variant="outline"
            className="ml-2 border-emerald-500/30 text-emerald-400"
          >
            {data.resolved.strategy}
          </Badge>
        </div>
      </div>
      <div className="p-6">
        {/* Anime card */}
        <div className="mb-6 flex gap-4">
          {data.anilist.coverImage?.large && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.anilist.coverImage.large}
              alt={data.resolved.matchedTitle || "cover"}
              className="h-32 w-24 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-lg font-semibold text-white">
              {data.resolved.matchedTitle ||
                data.anilist.title.english ||
                data.anilist.title.romaji}
            </div>
            <div className="mb-2 flex flex-wrap gap-2 text-xs text-zinc-400">
              {data.anilist.seasonYear && (
                <span>{data.anilist.seasonYear}</span>
              )}
              {data.anilist.format && (
                <span>· {data.anilist.format}</span>
              )}
              {data.anilist.idMal && (
                <span>· MAL: {data.anilist.idMal}</span>
              )}
            </div>
            <div className="text-xs text-zinc-500">
              AniList ID:{" "}
              <code className="font-mono text-emerald-400">
                {data.anilistId}
              </code>
            </div>
          </div>
        </div>

        <ResultRow
          label={`${data.provider} Native ID`}
          value={data.nativeId}
          icon={<Database className="h-4 w-4 text-rose-400" />}
          highlight
          copied={copied === "nativeId"}
          onCopy={() => copy(data.nativeId, "nativeId")}
        />

        <ResultRow
          label="Universal ID (works on every provider)"
          value={data.universalId}
          icon={<Sparkles className="h-4 w-4 text-emerald-400" />}
          copied={copied === "universalId"}
          onCopy={() => copy(data.universalId, "universalId")}
        />

        <ResultRow
          label="Ready-to-use /sources URL (native id)"
          value={data.sourcesUrl}
          icon={<ExternalLink className="h-4 w-4 text-sky-400" />}
          copied={copied === "sourcesUrl"}
          onCopy={() => copy(data.sourcesUrl, "sourcesUrl")}
        />

        <ResultRow
          label="Ready-to-use /sources URL (universal id)"
          value={data.universalSourcesUrl}
          icon={<ExternalLink className="h-4 w-4 text-emerald-400" />}
          copied={copied === "universalSourcesUrl"}
          onCopy={() => copy(data.universalSourcesUrl, "universalSourcesUrl")}
        />

        {data.resolved.triedTitles && data.resolved.triedTitles.length > 0 && (
          <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Resolution trace — titles tried on {data.provider}
            </div>
            <ol className="space-y-1 text-sm text-zinc-300">
              {data.resolved.triedTitles.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-0.5 text-zinc-500">{i + 1}.</span>
                  <span
                    className={
                      t === data.resolved.matchedTitle
                        ? "font-semibold text-emerald-400"
                        : "text-zinc-400"
                    }
                  >
                    {t}
                    {t === data.resolved.matchedTitle && "  ✓ matched"}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`${data.sourcesUrl}&server=kite&type=sub`}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
          >
            <ExternalLink className="h-4 w-4" />
            Open episode 1 sources
          </Link>
          <Link
            href={`/api/scrape/info?id=${encodeURIComponent(data.nativeId)}&provider=${data.provider}`}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            <ExternalLink className="h-4 w-4" />
            Get anime info
          </Link>
          <Link
            href={`/api/scrape/episodes?id=${encodeURIComponent(data.nativeId)}&provider=${data.provider}`}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            <ExternalLink className="h-4 w-4" />
            Get episode list
          </Link>
        </div>
      </div>
    </div>
  );
}

function AllProvidersResult({
  data,
  copy,
  copied,
}: {
  data: AllProvidersResponse;
  copy: (text: string, key: string) => void;
  copied: string | null;
}) {
  const entries = Object.entries(data.providers);
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5">
      <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-6 py-3">
        <div className="flex items-center gap-2 text-emerald-300">
          <Layers className="h-4 w-4" />
          <span className="font-semibold">Resolved across all providers</span>
          <Badge
            variant="outline"
            className="ml-2 border-emerald-500/30 text-emerald-400"
          >
            {data.availableCount}/{entries.length} available
          </Badge>
          {data.bestProvider && (
            <Badge
              variant="outline"
              className="ml-2 border-amber-500/30 text-amber-400"
            >
              best: {data.bestProvider}
            </Badge>
          )}
        </div>
      </div>
      <div className="p-6">
        {/* Anime card */}
        <div className="mb-6 flex gap-4">
          {data.anilist.coverImage?.large && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.anilist.coverImage.large}
              alt="cover"
              className="h-32 w-24 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-lg font-semibold text-white">
              {data.anilist.title.english || data.anilist.title.romaji}
            </div>
            <div className="mb-2 flex flex-wrap gap-2 text-xs text-zinc-400">
              {data.anilist.seasonYear && (
                <span>{data.anilist.seasonYear}</span>
              )}
              {data.anilist.format && (
                <span>· {data.anilist.format}</span>
              )}
            </div>
            <div className="text-xs text-zinc-500">
              AniList ID:{" "}
              <code className="font-mono text-emerald-400">
                {data.anilistId}
              </code>{" "}
              · Universal:{" "}
              <button
                onClick={() => copy(data.universalId, "universalIdAll")}
                className="font-mono text-emerald-400 hover:underline"
              >
                {data.universalId}
              </button>
              {copied === "universalIdAll" && (
                <Check className="ml-1 inline h-3 w-3 text-emerald-400" />
              )}
            </div>
          </div>
        </div>

        {/* Per-provider results */}
        <div className="space-y-3">
          {entries.map(([pid, entry]) => (
            <ProviderRow
              key={pid}
              pid={pid}
              entry={entry}
              copy={copy}
              copied={copied}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderRow({
  pid,
  entry,
  copy,
  copied,
}: {
  pid: string;
  entry: ProviderEntry | null;
  copy: (text: string, key: string) => void;
  copied: string | null;
}) {
  const meta = PROVIDERS.find((p) => p.id === pid);
  const isAvailable = entry !== null;
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isAvailable
          ? "border-zinc-700 bg-zinc-900/60"
          : "border-zinc-800 bg-zinc-950/40 opacity-60"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block h-2 w-2 rounded-full",
              isAvailable ? "bg-emerald-400" : "bg-zinc-600"
            )}
          />
          <span className="font-semibold text-zinc-100">
            {meta?.label || pid}
          </span>
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-400">
            {pid}
          </code>
        </div>
        {isAvailable ? (
          <Badge
            variant="outline"
            className="border-emerald-500/30 text-emerald-400"
          >
            {entry!.resolved.strategy}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="border-rose-500/30 text-rose-400"
          >
            not found
          </Badge>
        )}
      </div>
      {isAvailable && entry && (
        <>
          <ResultRow
            label="Native ID"
            value={entry.nativeId}
            icon={<Database className="h-4 w-4 text-rose-400" />}
            highlight
            copied={copied === `${pid}:nativeId`}
            onCopy={() => copy(entry.nativeId, `${pid}:nativeId`)}
            compact
          />
          {entry.resolved.matchedTitle && (
            <div className="mb-2 text-xs text-zinc-500">
              Matched on:{" "}
              <span className="text-emerald-400">
                {entry.resolved.matchedTitle}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${entry.sourcesUrl}&server=kite&type=sub`}
              className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              /sources
            </Link>
            <Link
              href={`/api/scrape/info?id=${encodeURIComponent(entry.nativeId)}&provider=${pid}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              /info
            </Link>
            <Link
              href={`/api/scrape/episodes?id=${encodeURIComponent(entry.nativeId)}&provider=${pid}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              /episodes
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function ResultRow({
  label,
  value,
  icon,
  highlight,
  copied,
  onCopy,
  compact,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
  copied: boolean;
  onCopy: () => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mb-1.5" : "mb-3"}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2.5 font-mono text-sm",
          highlight
            ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
            : "border-zinc-800 bg-zinc-950/60 text-zinc-200",
          compact && "py-2 text-xs"
        )}
      >
        <span className="shrink-0">{icon}</span>
        <span className="min-w-0 flex-1 break-all">{value}</span>
        <button
          onClick={onCopy}
          className="shrink-0 rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          aria-label={`Copy ${label}`}
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Example anime — popular AniList IDs                                 */
/* ------------------------------------------------------------------ */

const EXAMPLES: { id: number; title: string }[] = [
  { id: 154587, title: "Frieren: Beyond Journey's End" },
  { id: 21, title: "One Piece" },
  { id: 5114, title: "Fullmetal Alchemist: Brotherhood" },
  { id: 101922, title: "Jujutsu Kaisen" },
  { id: 113415, title: "Solo Leveling" },
  { id: 16498, title: "Attack on Titan" },
];
