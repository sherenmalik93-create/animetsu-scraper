/**
 * Animetsu.live HTTP client
 *
 * The animetsu.live backend is fronted by Cloudflare.  Direct server-to-server
 * requests from a cloud IP sometimes get challenged, so this client always:
 *   1. Sends a realistic browser User-Agent + Referer
 *   2. Sets Accept: application/json
 *   3. Strips any CF challenge cookies (we don't have a real session) and falls
 *      back to the upstream proxy (swiftstream.top) when CF blocks us.
 *
 * The same client works on Vercel (Node runtime) and inside Docker — no
 * native deps, no Playwright required for the happy path.
 */

import type {
  SearchResponse,
  AnimeInfo,
  EpisodeList,
  ServerList,
  SourcesResponse,
} from "./types";

/** Base URL of the animetsu.live JSON API */
export const ANIMETSU_API_BASE =
  process.env.ANIMETSU_API_BASE || "https://animetsu.live/v2/api/anime";

/** Upstream proxy used by the official player for m3u8 / subtitle delivery */
export const SWIFTSTREAM_PROXY =
  process.env.SWIFTSTREAM_PROXY || "https://swiftstream.top/proxy";

/** Optional second proxy for fallback (e.g. a self-hosted cors-anywhere) */
export const FALLBACK_PROXY = process.env.FALLBACK_PROXY || "";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_HEADERS: HeadersInit = {
  "User-Agent": BROWSER_UA,
  Referer: "https://animetsu.live/",
  Origin: "https://animetsu.live",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Tiny in-memory cache so repeated requests for the same anime/episode are instant. */
const cache = new Map<string, { t: number; v: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.v as T;
}

function cacheSet<T>(key: string, v: T): T {
  cache.set(key, { t: Date.now(), v });
  // LRU-lite: cap at 500 entries
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  return v;
}

export class AnimetsuError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
    this.name = "AnimetsuError";
  }
}

/**
 * Internal fetch wrapper with retry + CF fallback.
 * Falls back to the swiftstream proxy URL when a 403/challenge response is returned.
 */
async function fetchJson<T>(url: string, retries = 2): Promise<T> {
  const cached = cacheGet<T>(url);
  if (cached !== undefined) return cached;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: DEFAULT_HEADERS,
        // Vercel edge runtime sometimes needs a redirect policy
        redirect: "follow",
        // Cache egress responses on Vercel's CDN when possible
        next: { revalidate: 60 },
      });

      if (res.status === 403 || res.status === 429 || res.status === 503) {
        // Cloudflare challenge or rate limit — try the fallback path if configured
        if (FALLBACK_PROXY && !url.startsWith(FALLBACK_PROXY)) {
          const fallbackUrl = `${FALLBACK_PROXY.replace(/\/$/, "")}/${url}`;
          const fbRes = await fetch(fallbackUrl, {
            headers: DEFAULT_HEADERS,
            next: { revalidate: 60 },
          });
          if (fbRes.ok) {
            const text = await fbRes.text();
            try {
              return cacheSet(url, JSON.parse(text) as T);
            } catch {
              // fall through to throw
            }
          }
        }
        throw new AnimetsuError(
          `Upstream returned ${res.status} (Cloudflare challenge or rate limit).`,
          res.status
        );
      }

      if (!res.ok) {
        throw new AnimetsuError(
          `Upstream returned ${res.status} ${res.statusText}`,
          res.status
        );
      }

      const text = await res.text();
      // Some endpoints return plain "Not Found" strings instead of JSON
      if (!text || text.trim() === "Not Found" || text.trim() === "") {
        throw new AnimetsuError("Upstream returned an empty response.", 404);
      }
      try {
        return cacheSet(url, JSON.parse(text) as T);
      } catch {
        throw new AnimetsuError("Upstream returned non-JSON response.", 502);
      }
    } catch (err) {
      lastErr = err;
      if (err instanceof AnimetsuError && (err.status === 403 || err.status === 429)) {
        // Backoff before retrying CF challenges
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      // For network errors, retry quickly
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new AnimetsuError("Unknown fetch failure.", 500);
}

/* -------------------------------------------------------------------------- */
/*                          Public scraper API                                */
/* -------------------------------------------------------------------------- */

export interface SearchOptions {
  query: string;
  page?: number;
  perPage?: number;
}

export async function searchAnime(opts: SearchOptions): Promise<SearchResponse> {
  const q = encodeURIComponent(opts.query.trim());
  if (!q) return { results: [] };
  const url = `${ANIMETSU_API_BASE}/search/?query=${q}`;
  return fetchJson<SearchResponse>(url);
}

export async function getAnimeInfo(id: string): Promise<AnimeInfo> {
  if (!id) throw new AnimetsuError("Anime id is required.", 400);
  return fetchJson<AnimeInfo>(`${ANIMETSU_API_BASE}/info/${id}`);
}

export async function getEpisodes(id: string): Promise<EpisodeList> {
  if (!id) throw new AnimetsuError("Anime id is required.", 400);
  return fetchJson<EpisodeList>(`${ANIMETSU_API_BASE}/eps/${id}`);
}

export async function getServers(
  id: string,
  epNum: number
): Promise<ServerList> {
  if (!id) throw new AnimetsuError("Anime id is required.", 400);
  return fetchJson<ServerList>(`${ANIMETSU_API_BASE}/servers/${id}/${epNum}`);
}

export interface SourcesOptions {
  watchId: string;
  epNum: number;
  server?: string; // "kite" | "dio" | "sage" | "meg" | "default"
  sourceType?: "sub" | "dub";
}

export async function getSources(
  opts: SourcesOptions
): Promise<SourcesResponse> {
  const { watchId, epNum, server = "kite", sourceType = "sub" } = opts;
  if (!watchId) throw new AnimetsuError("watchId is required.", 400);
  if (!epNum) throw new AnimetsuError("epNum is required.", 400);

  const url =
    `${ANIMETSU_API_BASE}/oppai/${watchId}/${epNum}` +
    `?server=${encodeURIComponent(server)}&source_type=${encodeURIComponent(sourceType)}`;
  return fetchJson<SourcesResponse>(url);
}

/**
 * Resolve the raw `sources[].url` returned by `/oppai/...` into a fully-qualified
 * m3u8 URL. The upstream returns a relative path like `/oppai/kite/<token>`;
 * when `need_proxy === true`, the host is `swiftstream.top/proxy`, otherwise
 * it is the animetsu API base.
 */
export function resolveStreamUrl(
  rawUrl: string,
  needProxy?: boolean
): string {
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  const base = needProxy
    ? SWIFTSTREAM_PROXY.replace(/\/$/, "")
    : ANIMETSU_API_BASE.replace(/\/anime$/, "");
  return `${base}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
}

/**
 * Fetch the master playlist and parse out quality levels.
 * Master playlists look like:
 *
 *   #EXTM3U
 *   #EXT-X-VERSION:3
 *   #EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,NAME="360p"
 *   <token>
 *   #EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,NAME="720p"
 *   <token>
 *
 * The variant URI is a relative path; we resolve it against the master URL.
 */
export async function parseMasterPlaylist(
  masterUrl: string
): Promise<{ label: string; bandwidth: number; resolution: string; url: string }[]> {
  const res = await fetch(masterUrl, {
    headers: {
      "User-Agent": BROWSER_UA,
      Referer: "https://animetsu.live/",
    },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    throw new AnimetsuError(
      `Failed to fetch master playlist: ${res.status}`,
      res.status
    );
  }
  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const qualities: { label: string; bandwidth: number; resolution: string; url: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && line.startsWith("#EXT-X-STREAM-INF:")) {
      const bwMatch = line.match(/BANDWIDTH=(\d+)/);
      const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      const nameMatch = line.match(/NAME="([^"]+)"/);
      const nextLine = lines[i + 1]?.trim();
      if (nextLine && !nextLine.startsWith("#")) {
        const variantUrl = new URL(nextLine, masterUrl).href;
        qualities.push({
          label: nameMatch?.[1] || resMatch?.[1] || `${bwMatch?.[1] || "?"} bps`,
          bandwidth: bwMatch ? Number(bwMatch[1]) : 0,
          resolution: resMatch?.[1] || "unknown",
          url: variantUrl,
        });
      }
    }
  }
  return qualities;
}

/**
 * High-level helper that combines getSources + resolveStreamUrl + parseMasterPlaylist
 * into a single player-ready payload.
 */
export async function resolveSources(
  opts: SourcesOptions
): Promise<import("./types").ResolvedSource> {
  const raw = await getSources(opts);

  const primary = raw.sources?.[0];
  if (!primary) {
    throw new AnimetsuError("No stream source returned by upstream.", 404);
  }

  const masterUrl = resolveStreamUrl(primary.url, primary.need_proxy);

  let qualities: { label: string; bandwidth: number; resolution: string; url: string }[] = [];
  try {
    qualities = await parseMasterPlaylist(masterUrl);
  } catch {
    // If the master playlist can't be parsed (e.g. it's already a media playlist),
    // fall back to a single entry pointing at the master URL itself.
    qualities = [
      { label: primary.quality || "auto", bandwidth: 0, resolution: "auto", url: masterUrl },
    ];
  }

  const subtitles = (raw.subs || []).map((s) => ({
    url: s.url,
    lang: s.lang || "Unknown",
  }));

  return {
    masterUrl,
    qualities,
    subtitles,
    skips: raw.skips || {},
    server: raw.server || opts.server || "kite",
    needProxy: !!primary.need_proxy,
  };
}
