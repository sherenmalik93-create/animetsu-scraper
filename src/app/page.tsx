"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Play, Star, Calendar, Tv, Loader2, ChevronLeft, Film, Flame } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { HlsPlayer, type Quality, type Subtitle, type SkipMarkers } from "@/components/animetsu/hls-player";

interface SearchResult {
  id: string;
  title: { romaji?: string; english?: string; native?: string };
  cover_image?: { large?: string; medium?: string; color?: string };
  banner?: string;
  status?: string;
  year?: number;
  average_score?: number;
  total_eps?: number | null;
  genres?: string[];
  is_adult?: boolean;
  format?: string;
}

interface AnimeInfo extends SearchResult {
  anilist_id?: number;
  mal_id?: number;
  description?: string;
  duration?: number;
  season?: string;
  start_date?: string | null;
  synonyms?: string[];
  tags?: string[];
  next_airing_ep?: { airing_at?: number; ep_num?: number; time_left?: number };
  anilist?: {
    characters?: { nodes: { id: number; name: { full: string; native?: string }; image?: { large?: string } }[] };
    studios?: { nodes: { id: number; name: string }[] };
    recommendations?: { nodes: { id: number; mediaRecommendation?: { id: number; title: { romaji?: string; english?: string }; coverImage?: { large?: string }; averageScore?: number } }[] };
    trailer?: { id: string; site: string };
    popularity?: number;
    favourites?: number;
    trending?: number;
  } | null;
}

interface Episode {
  ep_num: number;
  name?: string;
  desc?: string;
  img?: string;
  is_filler?: boolean;
  views?: number;
  aired_at?: string;
  id: string;
}

interface ServerInfo { id: string; default?: boolean; tip?: string; }

interface SourcesPayload {
  masterUrl: string;
  qualities: Quality[];
  subtitles: Subtitle[];
  skips: SkipMarkers;
  server: string;
  needProxy: boolean;
}

type View =
  | { kind: "home" }
  | { kind: "details"; id: string }
  | { kind: "watch"; id: string; ep: number };

const titleStr = (t?: { romaji?: string; english?: string; native?: string }) =>
  t?.english || t?.romaji || t?.native || "Unknown";

export default function Home() {
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
  const [server, setServer] = useState("kite");
  const [sourceType, setSourceType] = useState<"sub" | "dub">("sub");
  const [error, setError] = useState<string | null>(null);

  // Load home page data (trending + recent) on mount
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
                cover_image: {
                  large: (m.coverImage as { large?: string })?.large,
                  color: (m.coverImage as { color?: string })?.color,
                },
                average_score: (m as { averageScore?: number }).averageScore,
                year: (m as { seasonYear?: number }).seasonYear,
                format: (m as { format?: string }).format,
                total_eps: (m as { episodes?: number }).episodes,
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

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/scrape/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSearchResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

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
          fetch(`/api/scrape/info?id=${view.id}`).then((r) => r.json()),
          fetch(`/api/scrape/episodes?id=${view.id}`).then((r) => r.json()),
        ]);
        setInfo(infoRes);
        setEpisodes(Array.isArray(epsRes) ? epsRes : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load anime.");
      } finally {
        setInfoLoading(false);
      }
    })();
  }, [view]);

  // Load servers when entering watch view
  useEffect(() => {
    if (view.kind !== "watch") return;
    setError(null);
    setServers([]);
    setSources(null);
    (async () => {
      try {
        const sRes = await fetch(`/api/scrape/servers?id=${view.id}&ep=${view.ep}`).then((r) => r.json());
        setServers(Array.isArray(sRes) ? sRes : []);
        const defaultServer = (Array.isArray(sRes) ? sRes.find((s: ServerInfo) => s.default) : null)?.id || "kite";
        setServer(defaultServer);
        await loadSources(view.id, view.ep, defaultServer, sourceType);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load servers.");
      }
    })();
     
  }, [view]);

  const resolveBySearch = useCallback(async (title: string) => {
    setError(null);
    setInfoLoading(true);
    try {
      const res = await fetch(`/api/scrape/search?q=${encodeURIComponent(title)}`);
      const data = await res.json();
      const first = data.results?.[0];
      if (first?.id) {
        setView({ kind: "details", id: first.id });
      } else {
        setError(`No animetsu entry found for "${title}".`);
        setInfoLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
      setInfoLoading(false);
    }
  }, []);

  const loadSources = useCallback(
    async (id: string, ep: number, srv: string, type: "sub" | "dub") => {
      setSourcesLoading(true);
      setSources(null);
      setError(null);
      try {
        const res = await fetch(`/api/scrape/sources?id=${id}&ep=${ep}&server=${srv}&type=${type}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setSources(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load stream.");
      } finally {
        setSourcesLoading(false);
      }
    },
    []
  );

  // Reload sources when server or sourceType changes during watch
  useEffect(() => {
    if (view.kind !== "watch") return;
    loadSources(view.id, view.ep, server, sourceType);
     
  }, [server, sourceType]);

  const currentEp = useMemo(
    () => episodes?.find((e) => e.ep_num === (view.kind === "watch" ? view.ep : -1)),
    [episodes, view]
  );

  const onNextEp = useCallback(() => {
    if (view.kind !== "watch" || !episodes) return;
    const next = episodes.find((e) => e.ep_num === view.ep + 1);
    if (next) setView({ kind: "watch", id: view.id, ep: next.ep_num });
  }, [view, episodes]);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => setView({ kind: "home" })}
            className="flex items-center gap-2 font-semibold"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-orange-500 text-sm font-bold">
              A
            </div>
            <span className="hidden sm:inline">Animetsu Scraper</span>
          </button>

          <div className="relative ml-auto w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anime…"
              className="border-white/10 bg-white/5 pl-9 focus-visible:border-rose-500/50 focus-visible:ring-rose-500/30"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-500" />
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* SEARCH RESULTS */}
        {searchResults ? (
          <section>
            <h2 className="mb-4 text-lg font-semibold">
              Search results {searchResults.length > 0 && `(${searchResults.length})`}
            </h2>
            {searchResults.length === 0 ? (
              <p className="text-sm text-zinc-500">No results found.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {searchResults.map((a) => (
                  <AnimeCard key={a.id} a={a} onClick={() => setView({ kind: "details", id: a.id })} />
                ))}
              </div>
            )}
          </section>
        ) : view.kind === "home" ? (
          <HomeView
            trending={trending}
            recent={recent}
            onPick={(id) => {
              // Trending items come from AniList and only carry the AniList id.
              // They are prefixed with "al:" so we can resolve them via search.
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
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView({ kind: "details", id: view.id })}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <div className="flex items-center gap-2">
                <Select value={server} onValueChange={setServer}>
                  <SelectTrigger className="h-8 w-32 border-white/10 bg-white/5 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {servers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.id} {s.default ? "(default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sourceType} onValueChange={(v) => setSourceType(v as "sub" | "dub")}>
                  <SelectTrigger className="h-8 w-20 border-white/10 bg-white/5 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sub">Sub</SelectItem>
                    <SelectItem value="dub">Dub</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="text-sm text-zinc-400">
              {info ? titleStr(info.title) : "Loading…"} — Episode {view.ep}
              {currentEp?.name && ` · ${currentEp.name}`}
            </div>

            {sourcesLoading ? (
              <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-black text-sm text-zinc-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading stream…
              </div>
            ) : sources ? (
              <HlsPlayer
                masterUrl={sources.masterUrl}
                qualities={sources.qualities}
                subtitles={sources.subtitles}
                skips={sources.skips}
                poster={info?.banner || info?.cover_image?.large}
                title={`${titleStr(info?.title)} — Ep ${view.ep}`}
                onEnded={onNextEp}
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-black text-sm text-zinc-500">
                No stream available.
              </div>
            )}

            {/* Episode picker below the player */}
            {episodes && episodes.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-zinc-300">Episodes</h3>
                <ScrollArea className="max-h-72 rounded-lg border border-white/10 bg-white/5 p-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                    {episodes.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setView({ kind: "watch", id: view.id, ep: e.ep_num })}
                        className={cn(
                          "rounded-md border px-2 py-1.5 text-xs font-medium transition",
                          e.ep_num === view.ep
                            ? "border-rose-500 bg-rose-500/20 text-white"
                            : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/30 hover:bg-white/10"
                        )}
                      >
                        Ep {e.ep_num}
                        {e.is_filler && (
                          <span className="ml-1 text-[10px] text-amber-400">filler</span>
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        ) : null}
      </main>

      <footer className="mt-auto border-t border-white/10 bg-zinc-950 px-4 py-6 text-center text-xs text-zinc-500">
        <p>
          Animetsu Scraper · Educational project · Streams are proxied from
          animetsu.live for personal use only.
        </p>
        <p className="mt-1">Metadata enriched via AniList GraphQL API.</p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

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
              <AnimeCard key={a.id} a={a} onClick={() => onPick(a.id)} />
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
  const cover = a.cover_image?.large || a.cover_image?.medium;
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
        {a.average_score ? (
          <Badge className="absolute right-1.5 top-1.5 bg-black/70 px-1.5 py-0 text-[10px] text-amber-400">
            <Star className="mr-0.5 h-2.5 w-2.5 fill-amber-400" /> {a.average_score}
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

      {/* Banner */}
      {info.banner ? (
         
        <img
          src={info.banner}
          alt=""
          className="h-48 w-full rounded-xl object-cover opacity-60 sm:h-64"
        />
      ) : null}

      <div className="flex flex-col gap-6 sm:flex-row">
        {/* Cover */}
        <div className="w-full shrink-0 sm:w-48">
          { }
          <img
            src={info.cover_image?.large || info.cover_image?.medium}
            alt={titleStr(info.title)}
            className="aspect-[2/3] w-full rounded-lg border border-white/10 object-cover"
          />
        </div>

        {/* Info */}
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
            {info.total_eps && (
              <Badge variant="outline">
                <Tv className="mr-1 h-3 w-3" /> {info.total_eps} eps
              </Badge>
            )}
            {info.average_score ? (
              <Badge variant="outline" className="text-amber-400">
                <Star className="mr-1 h-3 w-3 fill-amber-400" /> {info.average_score}
              </Badge>
            ) : null}
            {info.is_adult && <Badge variant="destructive">18+</Badge>}
          </div>

          {(info.genres?.length || info.tags?.length) && (
            <div className="flex flex-wrap gap-1.5">
              {(info.genres || []).slice(0, 8).map((g) => (
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

      {/* AniList trailer */}
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

      {/* Recommendations */}
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

      {/* Episodes */}
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
                  key={e.id}
                  onClick={() => onWatch(e.ep_num)}
                  className="flex w-full items-center gap-3 rounded-md border border-white/5 bg-white/5 p-2 text-left transition hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-rose-500/20 text-sm font-semibold text-rose-400">
                    {e.ep_num}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{e.name || `Episode ${e.ep_num}`}</p>
                      {e.is_filler && (
                        <Badge className="bg-amber-500/20 px-1 py-0 text-[9px] text-amber-400">filler</Badge>
                      )}
                    </div>
                    {e.desc && (
                      <p className="line-clamp-1 text-xs text-zinc-500">{e.desc}</p>
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
