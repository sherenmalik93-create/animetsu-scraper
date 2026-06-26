"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Play, Star, Calendar, Tv, Loader2, ChevronLeft, Film, Flame, Server, Code2, ChevronDown, ChevronUp, Copy, Check, BookOpen } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MediaPlayer,
  type Quality,
  type Subtitle,
  type SkipMarkers,
  type StreamSource,
} from "@/components/animetsu/media-player";

/* ------------------------------------------------------------------ */
/*  Types — these match the unified provider payloads                 */
/* ------------------------------------------------------------------ */

interface ProviderMeta {
  id: string;
  label: string;
  description: string;
  accent: string;
  supportsDub: boolean;
  defaultServer: string;
}

interface SearchResult {
  id: string;
  anilistId?: number;
  malId?: number;
  title: { romaji?: string; english?: string; native?: string; preferred?: string };
  coverImage?: { large?: string; medium?: string; small?: string; color?: string; cover?: string; banner?: string };
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
  // animetsu legacy fields (kept for backward compat with the old shape)
  cover_image?: { large?: string; medium?: string; color?: string };
  average_score?: number;
  total_eps?: number | null;
}

interface AnimeInfo extends SearchResult {
  anilist?: {
    characters?: { nodes: { id: number; name: { full: string; native?: string }; image?: { large?: string } }[] };
    studios?: { nodes: { id: number; name: string }[] };
    recommendations?: { nodes: { id: number; mediaRecommendation?: { id: number; title: { romaji?: string; english?: string }; coverImage?: { large?: string }; averageScore?: number } }[] };
    trailer?: { id: string; site: string };
    popularity?: number;
    favourites?: number;
    trending?: number;
  } | null;
  next_airing_ep?: { airing_at?: number; ep_num?: number; time_left?: number };
  synonyms?: string[];
  tags?: string[];
  start_date?: string | null;
}

interface Episode {
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
  variants?: string[];
}

interface ServerInfo { id: string; label?: string; description?: string; default?: boolean; }

interface SourcesPayload {
  sources: StreamSource[];
  subtitles: Subtitle[];
  skips?: SkipMarkers;
  server: string;
  provider: string;
  qualities?: Quality[];
  /** Raw upstream payload — exposed in the "Show raw response" panel */
  raw?: unknown;
  rawMulti?: Record<string, unknown>;
}

type View =
  | { kind: "home" }
  | { kind: "details"; id: string }
  | { kind: "watch"; id: string; ep: number };

const titleStr = (t?: { romaji?: string; english?: string; native?: string; preferred?: string }) =>
  t?.english || t?.romaji || t?.native || t?.preferred || "Unknown";

export default function Home() {
  const [providerId, setProviderId] = useState<string>("animetsu");
  const [providers, setProviders] = useState<ProviderMeta[]>([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [trending, setTrending] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const [view, setView] = useState<View>({ kind: "home" });
  const [info, setInfo] = useState<AnimeInfo | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [sources, setSources] = useState<SourcesPayload | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [server, setServer] = useState<string>("");
  const [sourceType, setSourceType] = useState<"sub" | "dub">("sub");
  const [error, setError] = useState<string | null>(null);

  // Load provider list on mount
  useEffect(() => {
    fetch("/api/scrape/providers")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.providers)) {
          setProviders(d.providers);
          // Set the default server for the active provider
          const active = d.providers.find((p: ProviderMeta) => p.id === providerId);
          if (active?.defaultServer) setServer(active.defaultServer);
        }
      })
      .catch(() => {});
  }, []);

  // When provider changes, reset state and update default server
  useEffect(() => {
    setSearchResults(null);
    setView({ kind: "home" });
    const active = providers.find((p) => p.id === providerId);
    if (active?.defaultServer) setServer(active.defaultServer);
  }, [providerId, providers]);

  // Load home page data (trending + recent) on mount — only for animetsu
  // (anikuro has its own trending endpoint)
  useEffect(() => {
    (async () => {
      try {
        const [tRes, rRes] = await Promise.all([
          fetch("/api/scrape/anilist?trending=1").then((r) => r.json()),
          fetch("/api/scrape/recent?per_page=20").then((r) => r.json()).catch(() => null),
        ]);
        if (Array.isArray(tRes)) {
          setTrending(
            tRes.map((m: Record<string, unknown>) => {
              const title =
                (m.title as { english?: string })?.english ||
                (m.title as { romaji?: string })?.romaji ||
                "";
              return {
                id: `al:${encodeURIComponent(title)}`,
                title: {
                  english: (m.title as { english?: string })?.english,
                  romaji: (m.title as { romaji?: string })?.romaji,
                },
                coverImage: {
                  large: (m.coverImage as { large?: string })?.large,
                  color: (m.coverImage as { color?: string })?.color,
                },
                averageScore: (m as { averageScore?: number }).averageScore,
                year: (m as { seasonYear?: number }).seasonYear,
                format: (m as { format?: string }).format,
                totalEpisodes: (m as { episodes?: number }).episodes,
              };
            })
          );
        }
        if (rRes?.results && Array.isArray(rRes.results)) {
          setRecent(rRes.results);
        }
      } catch {
        /* ignore — home page is best-effort */
      }
    })();
  }, []);

  // Debounced search — uses the active provider
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/scrape/search?q=${encodeURIComponent(query)}&provider=${providerId}`);
        const data = await res.json();
        setSearchResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query, providerId]);

  // Load details when navigating
  useEffect(() => {
    if (view.kind !== "details") return;
    setInfo(null);
    setEpisodes(null);
    setInfoLoading(true);
    setError(null);
    (async () => {
      try {
        const [infoRes, epsRes] = await Promise.all([
          fetch(`/api/scrape/info?id=${view.id}&provider=${providerId}`).then((r) => r.json()),
          fetch(`/api/scrape/episodes?id=${view.id}&provider=${providerId}`).then((r) => r.json()),
        ]);
        setInfo(infoRes);
        setEpisodes(Array.isArray(epsRes) ? epsRes : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load anime.");
      } finally {
        setInfoLoading(false);
      }
    })();
  }, [view, providerId]);

  // Load servers when entering watch view
  useEffect(() => {
    if (view.kind !== "watch") return;
    setError(null);
    setServers([]);
    setSources(null);
    (async () => {
      try {
        const sRes = await fetch(`/api/scrape/servers?id=${view.id}&ep=${view.ep}&provider=${providerId}`).then((r) => r.json());
        setServers(Array.isArray(sRes) ? sRes : []);
        const defaultSrv = (Array.isArray(sRes) ? sRes.find((s: ServerInfo) => s.default) : null)?.id
          || (Array.isArray(sRes) && sRes[0]?.id) || "";
        setServer(defaultSrv);
        if (defaultSrv) {
          await loadSources(view.id, view.ep, defaultSrv, sourceType);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load servers.");
      }
    })();
     
  }, [view]);

  const resolveBySearch = useCallback(async (title: string) => {
    setError(null);
    setInfoLoading(true);
    try {
      const res = await fetch(`/api/scrape/search?q=${encodeURIComponent(title)}&provider=${providerId}`);
      const data = await res.json();
      const first = data.results?.[0];
      if (first?.id) {
        setView({ kind: "details", id: first.id });
      } else {
        setError(`No entry found for "${title}" on ${providerId}.`);
        setInfoLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
      setInfoLoading(false);
    }
  }, [providerId]);

  const loadSources = useCallback(
    async (id: string, ep: number, srv: string, type: "sub" | "dub") => {
      setSourcesLoading(true);
      setSources(null);
      setError(null);
      try {
        const res = await fetch(`/api/scrape/sources?id=${id}&ep=${ep}&server=${srv}&type=${type}&provider=${providerId}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSources(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load stream.");
      } finally {
        setSourcesLoading(false);
      }
    },
    [providerId]
  );

  // Reload sources when server or sourceType changes during watch
  useEffect(() => {
    if (view.kind !== "watch" || !server) return;
    loadSources(view.id, view.ep, server, sourceType);
     
  }, [server, sourceType]);

  const currentEp = useMemo(
    () => episodes?.find((e) => e.number === (view.kind === "watch" ? view.ep : -1)),
    [episodes, view]
  );

  const onNextEp = useCallback(() => {
    if (view.kind !== "watch" || !episodes) return;
    const next = episodes.find((e) => e.number === view.ep + 1);
    if (next) setView({ kind: "watch", id: view.id, ep: next.number });
  }, [view, episodes]);

  const activeProvider = providers.find((p) => p.id === providerId);

  // Pick the primary source for the MediaPlayer
  const primarySource = sources?.sources?.[0];
  // For MP4 sources, expose all mp4 sources as quality levels
  const mp4Qualities: Quality[] = useMemo(() => {
    if (!sources || !primarySource || primarySource.type !== "mp4") return [];
    return sources.sources
      .filter((s) => s.type === "mp4")
      .map((s, i) => ({
        label: s.quality || `Quality ${i + 1}`,
        resolution: s.quality || "default",
        url: s.url,
      }));
  }, [sources, primarySource]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => setView({ kind: "home" })}
            className="flex items-center gap-2 font-semibold"
          >
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br text-sm font-bold",
              activeProvider?.accent || "from-rose-500 to-orange-500"
            )}>
              A
            </div>
            <span className="hidden sm:inline">Anime Scraper</span>
          </button>

          {/* Provider switcher */}
          {providers.length > 0 && (
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger className="h-8 w-32 border-white/10 bg-white/5 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="relative ml-auto w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search anime on ${activeProvider?.label || "…"}…`}
              className="border-white/10 bg-white/5 pl-9 focus-visible:border-rose-500/50 focus-visible:ring-rose-500/30"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-500" />
            )}
          </div>

          <Link
            href="/docs"
            className="hidden shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/10 hover:text-white sm:flex"
            title="API documentation"
          >
            <BookOpen className="h-3.5 w-3.5" />
            API Docs
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* SEARCH RESULTS — only shown on home view */}
        {searchResults && view.kind === "home" ? (
          <section>
            <h2 className="mb-4 text-lg font-semibold">
              Search results {searchResults.length > 0 && `(${searchResults.length})`}
            </h2>
            {searchResults.length === 0 ? (
              <p className="text-sm text-zinc-500">No results found on {activeProvider?.label}.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {searchResults.map((a) => (
                  <AnimeCard
                    key={a.id}
                    a={normalizeSearchResult(a)}
                    onClick={() => setView({ kind: "details", id: a.id })}
                  />
                ))}
              </div>
            )}
          </section>
        ) : view.kind === "home" ? (
          <HomeView
            trending={trending}
            recent={recent}
            onPick={(id) => {
              if (id.startsWith("al:")) {
                const title = decodeURIComponent(id.slice(3));
                void resolveBySearch(title);
              } else {
                setView({ kind: "details", id });
              }
            }}
          />
        ) : view.kind === "details" ? (
          <DetailsView
            info={info}
            episodes={episodes}
            loading={infoLoading}
            onBack={() => setView({ kind: "home" })}
            onWatch={(ep) => setView({ kind: "watch", id: view.id, ep })}
          />
        ) : view.kind === "watch" ? (
          <WatchView
            info={info}
            view={view}
            setView={setView}
            episodes={episodes}
            currentEp={currentEp}
            servers={servers}
            setServer={setServer}
            server={server}
            sourceType={sourceType}
            setSourceType={setSourceType}
            sourcesLoading={sourcesLoading}
            sources={sources}
            primarySource={primarySource}
            mp4Qualities={mp4Qualities}
            activeProvider={activeProvider}
            onNextEp={onNextEp}
          />
        ) : null}
      </main>

      <footer className="mt-auto border-t border-white/10 bg-zinc-950 px-4 py-6 text-center text-xs text-zinc-500">
        <p>
          Anime Scraper · {providers.length} providers ·{" "}
          {providers.map((p) => p.label).join(" · ")}
        </p>
        <p className="mt-1">
          Educational project. Streams proxied from upstream providers for personal use only.
        </p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Normalize both the new unified shape and the old animetsu shape to the card shape. */
function normalizeSearchResult(a: SearchResult): SearchResult {
  return {
    id: a.id,
    title: a.title,
    coverImage: a.coverImage || (a.cover_image ? { large: a.cover_image.large, color: a.cover_image.color } : undefined),
    banner: a.banner,
    status: a.status,
    year: a.year,
    format: a.format,
    genres: a.genres,
    averageScore: a.averageScore ?? a.average_score,
    totalEpisodes: a.totalEpisodes ?? a.total_eps,
    isAdult: a.isAdult,
    duration: a.duration,
    season: a.season,
  };
}

function HomeView({
  trending,
  recent,
  onPick,
}: {
  trending: SearchResult[];
  recent: SearchResult[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-10">
      {trending.length > 0 && (
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Flame className="h-5 w-5 text-rose-500" /> Trending Now
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {trending.slice(0, 12).map((a) => (
              <AnimeCard key={a.id} a={a} onClick={() => onPick(String(a.id))} trending />
            ))}
          </div>
        </section>
      )}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Film className="h-5 w-5 text-orange-500" /> Recently Released
        </h2>
        {recent.length === 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {recent.map((a) => (
              <AnimeCard key={a.id} a={normalizeSearchResult(a)} onClick={() => onPick(a.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AnimeCard({
  a,
  onClick,
  trending,
}: {
  a: SearchResult;
  onClick: () => void;
  trending?: boolean;
}) {
  const cover = a.coverImage?.large || a.coverImage?.cover || a.coverImage?.medium;
  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-lg border border-white/10 bg-white/5 text-left transition hover:border-white/30 hover:bg-white/10"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-800">
        {cover ? (
           
          <img
            src={cover}
            alt={titleStr(a.title)}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-zinc-600">
            {titleStr(a.title).charAt(0)}
          </div>
        )}
        {trending && (
          <Badge className="absolute left-1.5 top-1.5 bg-rose-500/90 px-1.5 py-0 text-[10px] text-white">
            HOT
          </Badge>
        )}
        {a.averageScore ? (
          <Badge className="absolute right-1.5 top-1.5 bg-black/70 px-1.5 py-0 text-[10px] text-amber-400">
            <Star className="mr-0.5 h-2.5 w-2.5 fill-amber-400" /> {a.averageScore}
          </Badge>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2">
          <div className="line-clamp-2 text-xs font-medium text-white">
            {titleStr(a.title)}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-zinc-500">
        <span>{a.year ?? "—"}</span>
        <span>{a.format ?? "TV"}</span>
      </div>
    </button>
  );
}

function DetailsView({
  info,
  episodes,
  loading,
  onBack,
  onWatch,
}: {
  info: AnimeInfo | null;
  episodes: Episode[] | null;
  loading: boolean;
  onBack: () => void;
  onWatch: (ep: number) => void;
}) {
  if (loading || !info) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full rounded-xl bg-white/5" />
        <div className="flex gap-4">
          <Skeleton className="h-48 w-32 rounded-lg bg-white/5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-2/3 bg-white/5" />
            <Skeleton className="h-4 w-1/3 bg-white/5" />
            <Skeleton className="h-20 w-full bg-white/5" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ChevronLeft className="mr-1 h-4 w-4" /> Back
      </Button>

      {info.banner ? (
         
        <img
          src={info.banner}
          alt=""
          className="h-48 w-full rounded-xl object-cover opacity-60 sm:h-64"
        />
      ) : null}

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="w-full shrink-0 sm:w-48">
          { }
          <img
            src={info.coverImage?.large || info.coverImage?.cover || info.coverImage?.medium}
            alt={titleStr(info.title)}
            className="aspect-[2/3] w-full rounded-lg border border-white/10 object-cover"
          />
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{titleStr(info.title)}</h1>
            {info.title.native && (
              <p className="text-sm text-zinc-500">{info.title.native}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {info.status && <Badge>{info.status}</Badge>}
            {info.format && <Badge variant="outline">{info.format}</Badge>}
            {info.year && (
              <Badge variant="outline">
                <Calendar className="mr-1 h-3 w-3" /> {info.year}
              </Badge>
            )}
            {info.totalEpisodes && (
              <Badge variant="outline">
                <Tv className="mr-1 h-3 w-3" /> {info.totalEpisodes} eps
              </Badge>
            )}
            {info.averageScore ? (
              <Badge variant="outline" className="text-amber-400">
                <Star className="mr-1 h-3 w-3 fill-amber-400" /> {info.averageScore}
              </Badge>
            ) : null}
            {info.isAdult && <Badge variant="destructive">18+</Badge>}
          </div>

          {(info.genres?.length) && (
            <div className="flex flex-wrap gap-1.5">
              {info.genres.slice(0, 8).map((g) => (
                <Badge key={g} variant="secondary" className="text-[10px]">
                  {g}
                </Badge>
              ))}
            </div>
          )}

          {info.description && (
            <p
              className="text-sm leading-relaxed text-zinc-300"
              dangerouslySetInnerHTML={{ __html: info.description }}
            />
          )}

          {info.anilist?.studios?.nodes?.length ? (
            <p className="text-xs text-zinc-500">
              Studio:{" "}
              {info.anilist.studios.nodes.map((s) => s.name).join(", ")}
            </p>
          ) : null}

          {info.next_airing_ep?.ep_num && (
            <Badge variant="outline" className="text-emerald-400">
              Ep {info.next_airing_ep.ep_num} airs in{" "}
              {Math.floor((info.next_airing_ep.time_left || 0) / 86400)}d{" "}
              {Math.floor(((info.next_airing_ep.time_left || 0) % 86400) / 3600)}h
            </Badge>
          )}
        </div>
      </div>

      {info.anilist?.trailer?.id && info.anilist.trailer.site === "youtube" && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${info.anilist.trailer.id}`}
            title="Trailer"
            className="aspect-video w-full"
            allowFullScreen
          />
        </div>
      )}

      {info.anilist?.recommendations?.nodes?.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recommended</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {info.anilist.recommendations.nodes
              .filter((r) => r.mediaRecommendation)
              .slice(0, 6)
              .map((r) => (
                <div
                  key={r.id}
                  className="overflow-hidden rounded-lg border border-white/10 bg-white/5"
                >
                  { }
                  <img
                    src={r.mediaRecommendation!.coverImage?.large}
                    alt=""
                    className="aspect-[2/3] w-full object-cover"
                  />
                  <div className="p-1.5">
                    <p className="line-clamp-2 text-[10px] text-zinc-400">
                      {r.mediaRecommendation!.title.english ||
                        r.mediaRecommendation!.title.romaji}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Episodes</h2>
          {episodes && <span className="text-xs text-zinc-500">{episodes.length} total</span>}
        </div>
        {!episodes ? (
          <Skeleton className="h-32 w-full rounded-lg bg-white/5" />
        ) : episodes.length === 0 ? (
          <p className="text-sm text-zinc-500">No episodes available.</p>
        ) : (
          <ScrollArea className="max-h-96 rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="space-y-1">
              {episodes.map((e) => (
                <button
                  key={e.sourceId}
                  onClick={() => onWatch(e.number)}
                  className="flex w-full items-center gap-3 rounded-md border border-white/5 bg-white/5 p-2 text-left transition hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-rose-500/20 text-sm font-semibold text-rose-400">
                    {e.displayNumber || e.number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{e.title || `Episode ${e.number}`}</p>
                      {e.filler && (
                        <Badge className="bg-amber-500/20 px-1 py-0 text-[9px] text-amber-400">filler</Badge>
                      )}
                    </div>
                    {e.description && (
                      <p className="line-clamp-1 text-xs text-zinc-500">{e.description}</p>
                    )}
                  </div>
                  <Play className="h-4 w-4 text-zinc-500" />
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Watch view — player + raw response panel + episode picker         */
/* ------------------------------------------------------------------ */

interface WatchViewProps {
  info: AnimeInfo | null;
  view: { kind: "watch"; id: string; ep: number };
  setView: (v: View) => void;
  episodes: Episode[] | null;
  currentEp?: Episode;
  servers: ServerInfo[];
  setServer: (s: string) => void;
  server: string;
  sourceType: "sub" | "dub";
  setSourceType: (t: "sub" | "dub") => void;
  sourcesLoading: boolean;
  sources: SourcesPayload | null;
  primarySource?: StreamSource;
  mp4Qualities: Quality[];
  activeProvider?: ProviderMeta;
  onNextEp: () => void;
}

function WatchView({
  info,
  view,
  setView,
  episodes,
  currentEp,
  servers,
  setServer,
  server,
  sourceType,
  setSourceType,
  sourcesLoading,
  sources,
  primarySource,
  mp4Qualities,
  activeProvider,
  onNextEp,
}: WatchViewProps) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="space-y-5">
      {/* Top bar — back + server + sub/dub selectors */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView({ kind: "details", id: view.id })}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to details
        </Button>
        <div className="flex items-center gap-2">
          {servers.length > 0 && (
            <Select value={server} onValueChange={setServer}>
              <SelectTrigger className="h-9 w-40 border-white/10 bg-white/5 text-xs">
                <Server className="mr-1.5 h-3.5 w-3.5 text-zinc-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {servers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label || s.id} {s.default ? "(default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sourceType} onValueChange={(v) => setSourceType(v as "sub" | "dub")}>
            <SelectTrigger className="h-9 w-24 border-white/10 bg-white/5 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sub">Sub</SelectItem>
              <SelectItem value="dub">Dub</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Title + status badge */}
      <div className="flex flex-wrap items-baseline gap-2 text-sm text-zinc-300">
        <span className="text-base font-semibold text-white">
          {info ? titleStr(info.title) : "Loading…"}
        </span>
        <span className="text-zinc-500">·</span>
        <span>Episode {view.ep}</span>
        {currentEp?.title && (
          <>
            <span className="text-zinc-500">·</span>
            <span className="italic text-zinc-400">{currentEp.title}</span>
          </>
        )}
        {sources && primarySource && (
          <Badge
            variant="outline"
            className="ml-1 border-white/15 bg-white/5 text-[10px] font-mono text-zinc-300"
          >
            {sources.server} · {primarySource.type?.toUpperCase()}
          </Badge>
        )}
      </div>

      {/* Player card */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 shadow-2xl shadow-black/50">
        {sourcesLoading ? (
          <div className="flex aspect-video w-full items-center justify-center bg-black text-sm text-zinc-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading stream from {activeProvider?.label}…
          </div>
        ) : primarySource ? (
          <MediaPlayer
            source={primarySource}
            qualities={primarySource.type === "mp4" ? mp4Qualities : sources?.qualities}
            subtitles={sources?.subtitles || []}
            skips={sources?.skips}
            poster={info?.banner || info?.coverImage?.large}
            title={`${titleStr(info?.title)} — Ep ${view.ep}`}
            onEnded={onNextEp}
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-black text-sm text-zinc-500">
            No stream available. Try a different server.
          </div>
        )}
      </div>

      {/* Action row — show raw response toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={showRaw ? "default" : "outline"}
          size="sm"
          onClick={() => setShowRaw((s) => !s)}
          className="font-mono text-xs"
        >
          <Code2 className="mr-1.5 h-3.5 w-3.5" />
          {showRaw ? "Hide raw response" : "Show raw response"}
          {showRaw ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
        </Button>
        {sources?.raw !== undefined && (
          <Badge variant="outline" className="text-[10px] text-zinc-400">
            {sources?.rawMulti
              ? `${Object.keys(sources.rawMulti).length} upstreams probed`
              : "raw payload attached"}
          </Badge>
        )}
        <a
          href={`/api/scrape/raw?provider=${sources?.provider || activeProvider?.id}&id=${view.id}&ep=${view.ep}&server=${server}&type=${sourceType}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
        >
          Open /api/scrape/raw ↗
        </a>
      </div>

      {/* Raw response panel — collapsible */}
      {showRaw && (
        <RawResponsePanel
          raw={sources?.raw}
          rawMulti={sources?.rawMulti}
          provider={sources?.provider || activeProvider?.id || "unknown"}
          animeId={view.id}
          ep={view.ep}
          server={server}
          streamType={sourceType}
        />
      )}

      {/* Episode picker */}
      {episodes && episodes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Episodes</h3>
          <ScrollArea className="max-h-72 rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {episodes.map((e) => (
                <button
                  key={e.sourceId}
                  onClick={() => setView({ kind: "watch", id: view.id, ep: e.number })}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs font-medium transition",
                    e.number === view.ep
                      ? "border-rose-500 bg-rose-500/20 text-white"
                      : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/30 hover:bg-white/10"
                  )}
                >
                  Ep {e.displayNumber || e.number}
                  {e.filler && (
                    <span className="ml-1 text-[10px] text-amber-400">filler</span>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Raw response panel — pretty-printed JSON with copy button         */
/* ------------------------------------------------------------------ */

interface RawResponsePanelProps {
  raw?: unknown;
  rawMulti?: Record<string, unknown>;
  provider: string;
  animeId: string;
  ep: number;
  server: string;
  streamType: "sub" | "dub";
}

function RawResponsePanel({
  raw,
  rawMulti,
  provider,
  animeId,
  ep,
  server,
  streamType,
}: RawResponsePanelProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"raw" | "rawMulti" | "unified">("raw");

  // If raw is missing but rawMulti exists, default to rawMulti tab.
  useEffect(() => {
    if (raw == null && rawMulti && Object.keys(rawMulti).length > 0) {
      setActiveTab("rawMulti");
    }
  }, [raw, rawMulti]);

  const payload = useMemo(() => {
    if (activeTab === "raw") return raw;
    if (activeTab === "rawMulti") return rawMulti;
    // For unified, the panel doesn't have access — show metadata instead.
    return {
      provider,
      animeId,
      episode: ep,
      server,
      streamType,
      note: "Use the /api/scrape/raw endpoint to see the unified sources + raw side by side.",
    };
  }, [activeTab, raw, rawMulti, provider, animeId, ep, server, streamType]);

  const jsonString = useMemo(() => {
    try {
      return payload == null ? "null" : JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }, [payload]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [jsonString]);

  const tabs: Array<{ id: "raw" | "rawMulti" | "unified"; label: string; count?: number }> = [
    { id: "raw", label: "raw" },
    { id: "rawMulti", label: "rawMulti", count: rawMulti ? Object.keys(rawMulti).length : undefined },
    { id: "unified", label: "meta" },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
      {/* Header — tabs + actions */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2">
        <div className="flex items-center gap-1">
          {tabs.map((t) => {
            const disabled =
              (t.id === "raw" && raw == null) ||
              (t.id === "rawMulti" && (!rawMulti || Object.keys(rawMulti).length === 0));
            return (
              <button
                key={t.id}
                onClick={() => !disabled && setActiveTab(t.id)}
                disabled={disabled}
                className={cn(
                  "rounded-md px-2.5 py-1 font-mono text-[11px] transition",
                  activeTab === t.id
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
                  disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-zinc-400"
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="ml-1 text-[9px] opacity-70">({t.count})</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[10px] text-zinc-500 sm:inline">
            {provider} · ep{ep} · {server}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCopy}
            className="h-7 px-2 font-mono text-[11px]"
          >
            {copied ? (
              <>
                <Check className="mr-1 h-3 w-3 text-emerald-400" /> Copied
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3 w-3" /> Copy
              </>
            )}
          </Button>
        </div>
      </div>

      {/* JSON body */}
      <div className="max-h-[28rem] overflow-auto">
        <pre
          className="p-4 font-mono text-[11px] leading-relaxed text-zinc-300"
          dangerouslySetInnerHTML={{ __html: syntaxHighlight(jsonString) }}
        />
      </div>

      {/* Footer — direct API link */}
      <div className="border-t border-white/10 bg-white/5 px-3 py-2">
        <a
          href={`/api/scrape/raw?provider=${provider}&id=${encodeURIComponent(animeId)}&ep=${ep}&server=${encodeURIComponent(server)}&type=${streamType}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[10px] text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
        >
          GET /api/scrape/raw?provider={provider}&id={animeId}&ep={ep}&server={server}&type={streamType} ↗
        </a>
      </div>
    </div>
  );
}

/**
 * Tiny JSON syntax highlighter — wraps tokens in <span> tags with colors.
 * Operates on the pretty-printed JSON string, so it's safe to render with
 * dangerouslySetInnerHTML inside a <pre><code> block.
 */
function syntaxHighlight(json: string): string {
  // Escape HTML first
  const esc = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = "text-amber-300"; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "text-sky-400"; // key
        } else {
          cls = "text-emerald-300"; // string
        }
      } else if (/true|false/.test(match)) {
        cls = "text-fuchsia-400"; // boolean
      } else if (/null/.test(match)) {
        cls = "text-zinc-500"; // null
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
