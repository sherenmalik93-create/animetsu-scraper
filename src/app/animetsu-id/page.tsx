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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types — mirror the /api/scrape/animetsu-id response                */
/* ------------------------------------------------------------------ */

interface AnilistMedia {
  id: number;
  idMal?: number;
  title: { romaji?: string; english?: string; native?: string };
  synonyms?: string[];
  coverImage?: { large?: string; medium?: string; color?: string };
  seasonYear?: number;
  format?: string;
}

interface AnimetsuIdResponse {
  anilistId: number;
  animetsuId: string;
  matchedTitle?: string;
  strategy: "passthrough" | "title-search" | "cache-hit";
  triedTitles: string[];
  anilist: AnilistMedia;
  universalId: string;
  sourcesUrl: string;
  universalSourcesUrl: string;
}

interface AnimetsuIdError {
  error: string;
  anilistId?: number;
  anilist?: AnilistMedia;
  triedTitles?: string[];
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function AnimetsuIdFindingPage() {
  const [anilistInput, setAnilistInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnimetsuIdResponse | null>(null);
  const [error, setError] = useState<AnimetsuIdError | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const lookup = useCallback(async () => {
    const trimmed = anilistInput.trim();
    if (!trimmed) return;
    // Allow user to paste either "154587" or "al:154587" or an anilist.co URL
    const digits = trimmed.match(/(\d+)/)?.[1];
    if (!digits) {
      setError({ error: "Please enter a numeric AniList ID (e.g. 154587)." });
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/scrape/animetsu-id?anilist=${digits}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data as AnimetsuIdError);
      } else {
        setResult(data as AnimetsuIdResponse);
      }
    } catch (err) {
      setError({
        error: err instanceof Error ? err.message : "Network error.",
      });
    } finally {
      setLoading(false);
    }
  }, [anilistInput]);

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
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-400">
              Animetsu ID Finding
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/docs#universal-routing"
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
            Animetsu ID Finding
          </h1>
          <p className="max-w-2xl text-zinc-400">
            Enter an AniList ID and get back the animetsu native Mongo
            ObjectId — the long string like{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-rose-400">
              6989b8a029cf95f4eb03b500
            </code>{" "}
            that animetsu uses internally. The backend looks up the AniList
            title, searches animetsu&apos;s catalog, and matches automatically.
          </p>
        </div>

        {/* Lookup card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <label className="mb-2 block text-sm font-medium text-zinc-300">
            AniList ID
          </label>
          <div className="flex gap-3">
            <div className="relative flex-1">
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
            <Button
              onClick={lookup}
              disabled={loading || !anilistInput.trim()}
              className="bg-rose-500 text-white hover:bg-rose-600 disabled:opacity-40"
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
          <p className="mt-3 text-xs text-zinc-500">
            Tip: the AniList ID is the number in any{" "}
            <a
              href="https://anilist.co/search/anime"
              target="_blank"
              rel="noreferrer"
              className="text-rose-400 hover:underline"
            >
              anilist.co/anime/&lt;id&gt;
            </a>{" "}
            URL. Resolution is cached for 30 min on the server, so repeated
            lookups are instant.
          </p>
        </div>

        {/* Result */}
        {result && (
          <div className="mt-6 overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5">
            <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-6 py-3">
              <div className="flex items-center gap-2 text-emerald-300">
                <Sparkles className="h-4 w-4" />
                <span className="font-semibold">Resolved</span>
                <Badge
                  variant="outline"
                  className="ml-2 border-emerald-500/30 text-emerald-400"
                >
                  {result.strategy}
                </Badge>
              </div>
            </div>
            <div className="p-6">
              {/* Anime card */}
              <div className="mb-6 flex gap-4">
                {result.anilist.coverImage?.large && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={result.anilist.coverImage.large}
                    alt={result.matchedTitle || "cover"}
                    className="h-32 w-24 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-1 text-lg font-semibold text-white">
                    {result.matchedTitle ||
                      result.anilist.title.english ||
                      result.anilist.title.romaji}
                  </div>
                  <div className="mb-2 flex flex-wrap gap-2 text-xs text-zinc-400">
                    {result.anilist.seasonYear && (
                      <span>{result.anilist.seasonYear}</span>
                    )}
                    {result.anilist.format && (
                      <span>· {result.anilist.format}</span>
                    )}
                    {result.anilist.idMal && (
                      <span>· MAL: {result.anilist.idMal}</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    AniList ID:{" "}
                    <code className="font-mono text-emerald-400">
                      {result.anilistId}
                    </code>
                  </div>
                </div>
              </div>

              {/* The big value: animetsu Mongo ObjectId */}
              <ResultRow
                label="Animetsu Native ID (Mongo ObjectId)"
                value={result.animetsuId}
                icon={<Database className="h-4 w-4 text-rose-400" />}
                highlight
                copied={copied === "animetsuId"}
                onCopy={() => copy(result.animetsuId, "animetsuId")}
              />

              <ResultRow
                label="Universal ID (works on every provider)"
                value={result.universalId}
                icon={<Sparkles className="h-4 w-4 text-emerald-400" />}
                copied={copied === "universalId"}
                onCopy={() => copy(result.universalId, "universalId")}
              />

              <ResultRow
                label="Ready-to-use /sources URL (native id)"
                value={result.sourcesUrl}
                icon={<ExternalLink className="h-4 w-4 text-sky-400" />}
                copied={copied === "sourcesUrl"}
                onCopy={() => copy(result.sourcesUrl, "sourcesUrl")}
              />

              <ResultRow
                label="Ready-to-use /sources URL (universal id)"
                value={result.universalSourcesUrl}
                icon={<ExternalLink className="h-4 w-4 text-emerald-400" />}
                copied={copied === "universalSourcesUrl"}
                onCopy={() =>
                  copy(result.universalSourcesUrl, "universalSourcesUrl")
                }
              />

              {/* Tried titles (resolution trace) */}
              {result.triedTitles.length > 0 && (
                <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Resolution trace — titles tried on animetsu
                  </div>
                  <ol className="space-y-1 text-sm text-zinc-300">
                    {result.triedTitles.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-0.5 text-zinc-500">{i + 1}.</span>
                        <span
                          className={
                            t === result.matchedTitle
                              ? "font-semibold text-emerald-400"
                              : "text-zinc-400"
                          }
                        >
                          {t}
                          {t === result.matchedTitle && "  ✓ matched"}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Try it on /sources */}
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href={`${result.sourcesUrl}&server=kite&type=sub`}
                  className="inline-flex items-center gap-2 rounded-md bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open episode 1 sources
                </Link>
                <Link
                  href={`/api/scrape/info?id=${encodeURIComponent(
                    result.animetsuId
                  )}&provider=animetsu`}
                  className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  <ExternalLink className="h-4 w-4" />
                  Get anime info
                </Link>
                <Link
                  href={`/api/scrape/episodes?id=${encodeURIComponent(
                    result.animetsuId
                  )}&provider=animetsu`}
                  className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  <ExternalLink className="h-4 w-4" />
                  Get episode list
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 overflow-hidden rounded-xl border border-rose-500/30 bg-rose-500/5">
            <div className="border-b border-rose-500/20 bg-rose-500/10 px-6 py-3">
              <div className="flex items-center gap-2 text-rose-300">
                <AlertCircle className="h-4 w-4" />
                <span className="font-semibold">Could not resolve</span>
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
                    Titles we tried on animetsu
                  </div>
                  <ol className="space-y-1 text-sm text-zinc-400">
                    {error.triedTitles.map((t, i) => (
                      <li key={i}>
                        {i + 1}. {t}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-zinc-500">
                    This usually means animetsu doesn&apos;t have this anime
                    in its catalog, or it&apos;s listed under a different
                    title. Try a different provider — the universal id{" "}
                    <code className="font-mono text-emerald-400">
                      al:{error.anilistId}
                    </code>{" "}
                    works on every other provider too.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick examples */}
        {!result && !error && !loading && (
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
                    setTimeout(() => {
                      lookup();
                    }, 50);
                  }}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-left transition-colors hover:border-rose-500/40 hover:bg-zinc-900/80"
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
          <h2 className="mb-3 text-lg font-semibold text-white">
            How it works
          </h2>
          <ol className="space-y-3 text-sm text-zinc-400">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-xs font-bold text-rose-400">
                1
              </span>
              <div>
                <strong className="text-zinc-200">You provide an AniList ID.</strong>{" "}
                Find it in any{" "}
                <a
                  href="https://anilist.co/search/anime"
                  target="_blank"
                  rel="noreferrer"
                  className="text-rose-400 hover:underline"
                >
                  anilist.co/anime/&lt;id&gt;
                </a>{" "}
                URL. For example, Frieren is{" "}
                <code className="font-mono text-zinc-300">154587</code>.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-xs font-bold text-rose-400">
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
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-xs font-bold text-rose-400">
                3
              </span>
              <div>
                <strong className="text-zinc-200">
                  We search animetsu&apos;s catalog
                </strong>{" "}
                with each title in priority order until we get a hit. The
                response includes the full resolution trace so you can see
                exactly which title matched.
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-xs font-bold text-rose-400">
                4
              </span>
              <div>
                <strong className="text-zinc-200">
                  The animetsu Mongo ObjectId is returned
                </strong>{" "}
                along with a ready-to-use{" "}
                <code className="font-mono text-zinc-300">/sources</code> URL.
                Drop it into any API call as{" "}
                <code className="font-mono text-zinc-300">id=...</code>.
              </div>
            </li>
          </ol>
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">
            <strong className="font-semibold">Pro tip:</strong> You don&apos;t
            actually need this tool to use the API. Every endpoint already
            accepts the universal id{" "}
            <code className="font-mono">al:{"{anilistId}"}</code> and resolves
            it automatically. This tool exists for when you want to see the
            underlying animetsu id explicitly — for debugging, caching, or
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

function ResultRow({
  label,
  value,
  icon,
  highlight,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2.5 font-mono text-sm",
          highlight
            ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
            : "border-zinc-800 bg-zinc-950/60 text-zinc-200"
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
