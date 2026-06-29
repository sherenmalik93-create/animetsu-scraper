"use client";

import { useState, useCallback } from "react";
import {
  Search,
  Play,
  Copy,
  Check,
  Loader2,
  Film,
  Tv,
  Server,
  Code2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StreamSource {
  url: string;
  quality: string;
  type: "master" | "variant";
}

interface ScrapeResult {
  success: boolean;
  meta?: {
    tmdbId: string;
    title: string;
    year: string;
    backdrop: string;
    enToken: string;
    host: string;
  } | null;
  sources?: StreamSource[];
  proxiedSources?: StreamSource[];
  rawM3u8?: string | null;
  proxyM3u8Url?: string | null;
  error?: string;
  title?: string;
  imdbId?: string;
  fileName?: string;
}

interface MultiSourceResult {
  source: string;
  success: boolean;
  sources: StreamSource[];
  proxiedSources: StreamSource[];
  error?: string;
}

type ActionType = "scrape" | "streams" | "raw" | "multi";
type KindType = "movie" | "tv";
type SourceType = "auto" | "justhd" | "vidsrc" | "vidfast";

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VidfastPage() {
  const [tmdbId, setTmdbId] = useState("1265609");
  const [kind, setKind] = useState<KindType>("movie");
  const [season, setSeason] = useState("1");
  const [episode, setEpisode] = useState("1");
  const [action, setAction] = useState<ActionType>("scrape");
  const [source, setSource] = useState<SourceType>("auto");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [multiResults, setMultiResults] = useState<MultiSourceResult[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const scrape = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setMultiResults(null);
    setShowRaw(false);

    try {
      const params = new URLSearchParams({
        tmdb: tmdbId,
        kind,
        action,
        source,
      });
      if (kind === "tv") {
        params.set("season", season);
        params.set("episode", episode);
      }

      const apiRoute = action === "multi" ? "/api/vidfast" : "/api/vidfast";
      const res = await fetch(`${apiRoute}?${params}`);
      const data = await res.json();

      if (action === "multi" && data.results) {
        setMultiResults(data.results);
      } else {
        setResult(data);
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Fetch failed",
      });
    } finally {
      setLoading(false);
    }
  }, [tmdbId, kind, season, episode, action, source]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
              Vidfast M3U8 Scraper
            </h1>
          </div>
          <Badge variant="outline" className="text-zinc-400 border-zinc-700">
            Raw m3u8 + Proxy
          </Badge>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Search Controls */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* TMDB ID */}
            <div className="md:col-span-2">
              <label className="text-sm text-zinc-400 mb-1 block">TMDB ID</label>
              <div className="flex gap-2">
                <Input
                  value={tmdbId}
                  onChange={(e) => setTmdbId(e.target.value)}
                  placeholder="e.g. 1265609"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
                <Button
                  onClick={scrape}
                  disabled={loading || !tmdbId}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold shrink-0"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  {loading ? "Scraping..." : "Scrape"}
                </Button>
              </div>
            </div>

            {/* Kind */}
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Type</label>
              <div className="flex gap-1">
                {(["movie", "tv"] as KindType[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      kind === k
                        ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                        : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700"
                    )}
                  >
                    {k === "movie" ? (
                      <span className="flex items-center gap-1">
                        <Film className="w-3 h-3" /> Movie
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Tv className="w-3 h-3" /> TV
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Source */}
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as SourceType)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="auto">Auto</option>
                <option value="justhd">JustHD</option>
                <option value="vidsrc">VidSrc</option>
                <option value="vidfast">Vidfast</option>
              </select>
            </div>
          </div>

          {/* TV Season/Episode */}
          {kind === "tv" && (
            <div className="flex gap-4">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Season</label>
                <Input
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  type="number"
                  min="1"
                  className="bg-zinc-800 border-zinc-700 text-white w-24"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Episode</label>
                <Input
                  value={episode}
                  onChange={(e) => setEpisode(e.target.value)}
                  type="number"
                  min="1"
                  className="bg-zinc-800 border-zinc-700 text-white w-24"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {(["scrape", "streams", "raw", "multi"] as ActionType[]).map((a) => (
              <button
                key={a}
                onClick={() => setAction(a)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-xs font-medium transition-colors",
                  action === a
                    ? "bg-yellow-500 text-black"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                )}
              >
                {a === "scrape" && "Full Scrape"}
                {a === "streams" && "Streams Only"}
                {a === "raw" && "Raw M3U8"}
                {a === "multi" && "All Sources"}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {(result && !result.success && result.error) && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400">
            <p className="font-semibold">Error</p>
            <p className="text-sm mt-1">{result.error}</p>
          </div>
        )}

        {/* Metadata Card */}
        {result?.success && (result.meta || result.title) && (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Film className="w-5 h-5 text-yellow-400" />
              {result.meta?.title || result.title || "Unknown"}
              {result.meta?.year && (
                <span className="text-zinc-500 text-sm">({result.meta.year})</span>
              )}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {result.meta?.enToken && (
                <div>
                  <span className="text-zinc-500">EN Token</span>
                  <p className="text-yellow-400 font-mono text-xs truncate">
                    {result.meta.enToken.substring(0, 30)}...
                  </p>
                </div>
              )}
              {result.meta?.host && (
                <div>
                  <span className="text-zinc-500">Host</span>
                  <p className="text-white">{result.meta.host}</p>
                </div>
              )}
              {result.imdbId && (
                <div>
                  <span className="text-zinc-500">IMDB</span>
                  <p className="text-white">{result.imdbId}</p>
                </div>
              )}
              {result.fileName && (
                <div className="col-span-2 md:col-span-4">
                  <span className="text-zinc-500">File</span>
                  <p className="text-zinc-300 font-mono text-xs truncate">
                    {result.fileName}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stream Sources */}
        {result?.success && (result.sources?.length ?? 0) > 0 && (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-green-400" />
              m3u8 Stream URLs
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                {result.sources?.length} streams
              </Badge>
            </h2>
            <div className="space-y-3">
              {result.sources?.map((s, i) => (
                <div
                  key={i}
                  className="bg-zinc-800 rounded-lg p-3 border border-zinc-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        className={
                          s.type === "master"
                            ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                            : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                        }
                      >
                        {s.type}
                      </Badge>
                      <span className="text-sm text-zinc-300">{s.quality}</span>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => copyToClipboard(s.url, `src-${i}`)}
                        className="p-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 transition-colors"
                        title="Copy URL"
                      >
                        {copied === `src-${i}` ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-zinc-400" />
                        )}
                      </button>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 transition-colors"
                        title="Open in new tab"
                      >
                        <ExternalLink className="w-3 h-3 text-zinc-400" />
                      </a>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-zinc-500 break-all">
                    {s.url}
                  </p>
                </div>
              ))}
            </div>

            {/* Proxied URLs */}
            {result.proxiedSources && result.proxiedSources.length > 0 && (
              <div className="mt-6">
                <h3 className="text-md font-semibold mb-3 flex items-center gap-2">
                  <Play className="w-4 h-4 text-blue-400" />
                  Proxied URLs (CORS-ready)
                </h3>
                <div className="space-y-2">
                  {result.proxiedSources.map((s, i) => (
                    <div
                      key={`proxy-${i}`}
                      className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2"
                    >
                      <Badge
                        variant="outline"
                        className="text-blue-400 border-blue-500/30 text-xs shrink-0"
                      >
                        {s.quality}
                      </Badge>
                      <p className="text-xs font-mono text-zinc-400 truncate flex-1">
                        {s.url}
                      </p>
                      <button
                        onClick={() => copyToClipboard(s.url, `proxy-${i}`)}
                        className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 shrink-0"
                      >
                        {copied === `proxy-${i}` ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-zinc-400" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Proxy M3U8 URL */}
            {result.proxyM3u8Url && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <span className="text-xs text-yellow-400 font-semibold block mb-1">
                  HLS.js-ready Proxy URL
                </span>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-yellow-300 font-mono flex-1 break-all">
                    {result.proxyM3u8Url}
                  </code>
                  <button
                    onClick={() => copyToClipboard(result.proxyM3u8Url!, "proxy-master")}
                    className="p-1 rounded bg-zinc-700 hover:bg-zinc-600 shrink-0"
                  >
                    {copied === "proxy-master" ? (
                      <Check className="w-3 h-3 text-green-400" />
                    ) : (
                      <Copy className="w-3 h-3 text-zinc-400" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Raw M3U8 Content */}
        {result?.rawM3u8 && (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Code2 className="w-5 h-5 text-purple-400" />
                Raw M3U8 Playlist
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRaw(!showRaw)}
                  className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  {showRaw ? (
                    <>
                      <ChevronUp className="w-4 h-4" /> Hide
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" /> Show
                    </>
                  )}
                </button>
                <button
                  onClick={() => copyToClipboard(result.rawM3u8!, "raw-m3u8")}
                  className="p-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600"
                >
                  {copied === "raw-m3u8" ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-zinc-400" />
                  )}
                </button>
              </div>
            </div>
            {showRaw && (
              <pre className="bg-zinc-950 rounded-lg p-4 overflow-x-auto text-xs font-mono text-green-400 whitespace-pre-wrap max-h-96 overflow-y-auto">
                {result.rawM3u8}
              </pre>
            )}
          </div>
        )}

        {/* Multi Source Results */}
        {multiResults && (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-400" />
              All Sources Comparison
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {multiResults.map((mr, i) => (
                <div
                  key={i}
                  className={cn(
                    "bg-zinc-800 rounded-lg p-4 border",
                    mr.success
                      ? "border-green-500/30"
                      : "border-red-500/30"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-white">{mr.source}</span>
                    <Badge
                      className={
                        mr.success
                          ? "bg-green-500/20 text-green-400 border-green-500/30"
                          : "bg-red-500/20 text-red-400 border-red-500/30"
                      }
                    >
                      {mr.success ? `${mr.sources.length} streams` : "Failed"}
                    </Badge>
                  </div>
                  {mr.success && mr.proxiedSources[0] && (
                    <div className="mt-2">
                      <p className="text-xs text-zinc-500 mb-1">Master URL (proxied):</p>
                      <code className="text-xs font-mono text-blue-400 break-all">
                        {mr.proxiedSources[0].url}
                      </code>
                    </div>
                  )}
                  {mr.error && (
                    <p className="text-xs text-red-400 mt-1">{mr.error}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick API Reference */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <h2 className="text-lg font-bold mb-4">API Quick Reference</h2>
          <div className="space-y-3 text-sm">
            {[
              {
                label: "Full Scrape",
                url: "/api/vidfast?tmdb=1265609&action=scrape",
                desc: "Meta + m3u8 URLs + raw playlist + proxied URLs",
              },
              {
                label: "Streams Only",
                url: "/api/vidfast?tmdb=1265609&action=streams&source=justhd",
                desc: "Fast — just m3u8 stream URLs (no page scrape)",
              },
              {
                label: "Raw M3U8",
                url: "/api/vidfast?tmdb=1265609&action=raw",
                desc: "m3u8 URLs + raw playlist content",
              },
              {
                label: "All Sources",
                url: "/api/vidfast?tmdb=1265609&action=multi",
                desc: "Try all vaplayer sources (justhd, vidsrc, auto, vidfast)",
              },
              {
                label: "Vidlink",
                url: "/api/vidlink?tmdb=1265609&action=streams",
                desc: "Vidlink/vidsrc provider specifically",
              },
              {
                label: "TV Show",
                url: "/api/vidfast?tmdb=1396&kind=tv&season=1&episode=1",
                desc: "TV show with season/episode",
              },
              {
                label: "Proxy",
                url: "/api/proxy/m3u8?url={encoded_m3u8_url}",
                desc: "CORS proxy — drop into HLS.js",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-3 bg-zinc-800/50 rounded-lg px-4 py-2"
              >
                <Badge
                  variant="outline"
                  className="text-yellow-400 border-yellow-500/30 shrink-0 mt-0.5"
                >
                  {item.label}
                </Badge>
                <div>
                  <code className="text-xs font-mono text-green-400">{item.url}</code>
                  <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
