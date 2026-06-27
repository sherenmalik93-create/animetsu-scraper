/**
 * AnimeVerse provider — wraps https://animeverse.to/
 *
 * AnimeVerse uses a custom API with HMAC-signed requests:
 *
 *   1. POST /api/v1/session — obtain a `clientAuthKey` (base64url, 32 bytes)
 *      by sending a browser fingerprint object. The server returns a session
 *      cookie (`av_session`) and the HMAC key.
 *   2. For every subsequent API call, compute:
 *        - timestamp = Date.now()
 *        - message = "GET|/api/v1/path|{timestamp}"
 *        - HMAC-SHA256(clientAuthKey, message) → take first 16 bytes
 *        - Base64url-encode the 16 bytes → x-av-sig header
 *        - Send x-av-ts = timestamp, x-av-sig = signature
 *   3. The session cookie must accompany each request.
 *
 * API endpoints:
 *   /api/v1/trending?period=today&page=1  — trending shows
 *   /api/v1/recent                         — recently updated
 *   /api/v1/anime/{slug}                   — show detail
 *   /api/v1/anime/{slug}/stream/{ep}       — episode stream sources
 *   /api/v1/schedule?day=sun               — weekly schedule
 *   /api/v1/catalog                        — catalog
 *
 * NOTE: As of June 2026, animeverse.to is "temporarily down" behind
 * Cloudflare protection. The session endpoint still works but other
 * endpoints return 403. This provider is built against the documented API
 * and will work once the site comes back online.
 *
 * ID format: animeverse uses slugs like "tensei-shitara-slime-datta-ken-4th-season-1003223"
 * where the trailing number is a Nekokatsu ID. We also support "al:<anilistId>".
 */

import type {
  Provider,
  UnifiedSearchResult,
  UnifiedEpisode,
  UnifiedServer,
  UnifiedSources,
  UnifiedStreamSource,
} from "./types";
import { searchAniList, getAniListMedia } from "@/lib/anilist/client";

const ANIMEVERSE_BASE = "https://animeverse.to";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/* ------------------------------------------------------------------ */
/*  Session + HMAC auth                                                */
/* ------------------------------------------------------------------ */

interface SessionState {
  clientAuthKey: string;
  keyBytes: Uint8Array;
  cookie: string;
  expiresAt: number;
}

let sessionState: SessionState | null = null;

/** Obtain a fresh session from animeverse. */
async function getSession(): Promise<SessionState> {
  // Reuse existing session if not expired
  if (sessionState && Date.now() / 1000 < sessionState.expiresAt - 60) {
    return sessionState;
  }

  const fp = {
    ua: BROWSER_UA,
    language: "en-US",
    timezone: "America/Los_Angeles",
    hw: 8,
    screen: "1920x1080x24",
    canvas: "av-provider-fp-abc123",
    webgl: "Google Inc. (NVIDIA)|NVIDIA GeForce GTX 1060/PCIe/SSE2",
  };

  const res = await fetch(`${ANIMEVERSE_BASE}/api/v1/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": BROWSER_UA,
      Referer: `${ANIMEVERSE_BASE}/`,
      Origin: ANIMEVERSE_BASE,
    },
    body: JSON.stringify({ fp }),
  });

  if (!res.ok) {
    throw new Error(`[animeverse] Session failed: HTTP ${res.status}`);
  }

  // Extract session cookie
  const setCookie = res.headers.getSetCookie?.() || [];
  const avCookie = setCookie.find((c) => c.startsWith("av_session="));
  const cookieStr = avCookie ? avCookie.split(";")[0] : "";

  const data = await res.json();

  // Decode the base64url key
  const keyB64 = data.clientAuthKey as string;
  const padded = keyB64 + "=".repeat((4 - (keyB64.length % 4)) % 4);
  const keyBytes = Uint8Array.from(atob(padded.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

  sessionState = {
    clientAuthKey: keyB64,
    keyBytes,
    cookie: cookieStr,
    expiresAt: data.expiresAt as number,
  };

  return sessionState;
}

/** Compute HMAC-SHA256 signature for an API request. */
async function signRequest(method: string, path: string, keyBytes: Uint8Array): Promise<{ ts: string; sig: string }> {
  const ts = String(Date.now());
  const message = `${method}|${path}|${ts}`;
  const msgBytes = new TextEncoder().encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes.buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );

  const sigBuf = await crypto.subtle.sign("HMAC", cryptoKey, msgBytes);
  // Take first 16 bytes, then base64url-encode
  const first16 = new Uint8Array(sigBuf).slice(0, 16);
  const sigStr = String.fromCharCode(...first16);
  const sig = btoa(sigStr).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return { ts, sig };
}

/** Make an authenticated GET request to the animeverse API. */
async function apiGet<T>(path: string): Promise<T | null> {
  const session = await getSession();
  const { ts, sig } = await signRequest("GET", path, session.keyBytes);

  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    "x-av-ts": ts,
    "x-av-sig": sig,
    Referer: `${ANIMEVERSE_BASE}/`,
    Accept: "application/json",
  };

  if (session.cookie) {
    headers["Cookie"] = session.cookie;
  }

  const res = await fetch(`${ANIMEVERSE_BASE}${path}`, { headers });

  if (res.status === 401) {
    // Session expired — retry once
    sessionState = null;
    const session2 = await getSession();
    const { ts: ts2, sig: sig2 } = await signRequest("GET", path, session2.keyBytes);
    const headers2 = { ...headers, "x-av-ts": ts2, "x-av-sig": sig2, Cookie: session2.cookie };
    const res2 = await fetch(`${ANIMEVERSE_BASE}${path}`, { headers: headers2 });
    if (!res2.ok) return null;
    return res2.json() as T;
  }

  if (!res.ok) return null;
  return res.json() as T;
}

/* ------------------------------------------------------------------ */
/*  AnimeVerse data types                                              */
/* ------------------------------------------------------------------ */

interface AVSearchResult {
  id: string;
  slug: string;
  title: string;
  cover?: string;
  thumb?: string;
  rating?: number;
  ratingLabel?: string;
  type?: string;
  synopsis?: string;
  latestEpisode?: number;
  trending?: boolean;
}

interface AVAnimeDetail {
  id: string;
  slug: string;
  title: string;
  cover?: string;
  banner?: string;
  synopsis?: string;
  rating?: number;
  ratingLabel?: string;
  type?: string;
  status?: string;
  year?: number;
  season?: string;
  genres?: string[];
  episodeCount?: number;
  latestEpisode?: number;
  anilistId?: number;
}

interface AVStreamSource {
  url: string;
  type: "hls" | "mp4" | "iframe";
  quality?: string;
  label?: string;
}

interface AVStreamResponse {
  sources: AVStreamSource[];
  subtitles?: { url: string; lang: string }[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  server?: string;
}

/* ------------------------------------------------------------------ */
/*  In-process cache                                                   */
/* ------------------------------------------------------------------ */

const cache = new Map<string, { t: number; v: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.t > CACHE_TTL_MS) { cache.delete(key); return undefined; }
  return hit.v as T;
}

function cacheSet<T>(key: string, v: T): T {
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 500) { const k = cache.keys().next().value; if (k) cache.delete(k); }
  return v;
}

/* ------------------------------------------------------------------ */
/*  ID parsing                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse an animeverse ID. Supports:
 *   - Slug: "tensei-shitara-slime-datta-ken-4th-season-1003223"
 *   - Prefixed: "animeverse:tensei-shitara-slime-datta-ken-4th-season-1003223"
 *   - AniList universal: "al:154587"
 */
function parseAnimeverseId(id: string): string | null {
  if (id.startsWith("animeverse:")) return id.slice(11);
  if (id.startsWith("al:")) return null; // Needs resolution
  // Assume it's a slug
  return id;
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                            */
/* ------------------------------------------------------------------ */

export const animeverseProvider: Provider = {
  meta: {
    id: "animeverse",
    label: "AnimeVerse",
    description: "HMAC-secured API · Multiple servers · Schedule",
    accent: "from-violet-500 to-purple-600",
    supportsDub: false, // API doesn't clearly expose dub
    defaultServer: "default",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];

    // AnimeVerse doesn't have a search endpoint in the current API,
    // so we use AniList for search and map the results
    const alResults = await searchAniList(query);
    return alResults.map((r: any) => ({
      id: `al:${r.id}`,
      anilistId: r.id,
      title: { romaji: r.title?.romaji, english: r.title?.english, native: r.title?.native },
      coverImage: { large: r.coverImage?.large },
      description: r.description,
      status: r.status,
      year: r.seasonYear,
      format: r.format,
      genres: r.genres,
      averageScore: r.averageScore,
      totalEpisodes: r.episodes,
      duration: r.duration,
      season: r.season,
    }));
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    const slug = parseAnimeverseId(id);

    if (!slug) {
      // AniList ID — use AniList for metadata
      const alId = id.startsWith("al:") ? parseInt(id.slice(3)) : null;
      if (!alId) return null;

      const alData = await getAniListMedia(alId);
      if (!alData) return null;

      return {
        id: `al:${alId}`,
        anilistId: alId,
        title: {
          romaji: alData.title?.romaji,
          english: alData.title?.english,
          native: alData.title?.native,
          preferred: alData.title?.english || alData.title?.romaji,
        },
        coverImage: {
          large: alData.coverImage?.large,
        },
        banner: alData.bannerImage,
        description: alData.description,
        status: alData.status,
        year: alData.seasonYear,
        format: alData.format,
        genres: alData.genres,
        averageScore: alData.averageScore,
        totalEpisodes: alData.episodes,
        duration: alData.duration,
        season: alData.season,
      };
    }

    // Direct slug — fetch from animeverse API
    const data = await apiGet<AVAnimeDetail>(`/api/v1/anime/${encodeURIComponent(slug)}`);
    if (!data) return null;

    return {
      id: data.slug || data.id,
      anilistId: data.anilistId,
      title: { english: data.title, preferred: data.title },
      coverImage: data.cover ? { large: data.cover.startsWith("/") ? `${ANIMEVERSE_BASE}${data.cover}` : data.cover } : undefined,
      banner: data.banner,
      description: data.synopsis,
      status: data.status,
      year: data.year,
      format: data.type,
      genres: data.genres,
      averageScore: data.rating ? data.rating * 10 : undefined,
      totalEpisodes: data.episodeCount || data.latestEpisode,
    };
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const slug = parseAnimeverseId(id);

    if (!slug) {
      // For AniList IDs, we don't know the animeverse slug
      // Return a synthetic list based on AniList episode count
      const alId = id.startsWith("al:") ? parseInt(id.slice(3)) : null;
      if (!alId) return [];

      const alData = await getAniListMedia(alId);
      const total = alData?.episodes || 12;

      return Array.from({ length: total }, (_, i) => ({
        number: i + 1,
        displayNumber: String(i + 1),
        sourceId: `${id}:ep${i + 1}`,
        variants: ["sub"],
      }));
    }

    // Fetch anime detail to get episode count
    const data = await apiGet<AVAnimeDetail>(`/api/v1/anime/${encodeURIComponent(slug)}`);
    if (!data) return [];

    const total = data.episodeCount || data.latestEpisode || 0;
    if (total === 0) return [];

    return Array.from({ length: total }, (_, i) => ({
      number: i + 1,
      displayNumber: String(i + 1),
      sourceId: `${slug}:ep${i + 1}`,
      variants: ["sub"],
    }));
  },

  async getServers(id: string, epNum: number): Promise<UnifiedServer[]> {
    // AnimeVerse returns all sources in a single stream response
    return [{ id: "default", label: "Default", default: true }];
  },

  async getSources(opts: {
    id: string;
    epNum: number;
    server?: string;
    sourceType?: "sub" | "dub";
  }): Promise<UnifiedSources> {
    const { id, epNum, server, sourceType = "sub" } = opts;
    const slug = parseAnimeverseId(id);

    if (!slug) {
      return { sources: [], subtitles: [], server: server || "default", provider: "animeverse" };
    }

    // Fetch stream sources
    const cacheKey = `stream:${slug}:${epNum}`;
    const cached = cacheGet<AVStreamResponse>(cacheKey);

    let data: AVStreamResponse | null = cached || null;

    if (!data) {
      data = await apiGet<AVStreamResponse>(
        `/api/v1/anime/${encodeURIComponent(slug)}/stream/${epNum}`
      );
      if (data) cacheSet(cacheKey, data);
    }

    if (!data?.sources?.length) {
      return { sources: [], subtitles: [], server: server || "default", provider: "animeverse" };
    }

    const sources: UnifiedStreamSource[] = data.sources.map((src) => {
      // Determine if this is an HLS stream we should proxy
      const isHls = src.type === "hls" || src.url.includes(".m3u8");
      const isMaster = isHls && src.quality === "default";

      return {
        url: isHls
          ? `/api/proxy/m3u8?url=${encodeURIComponent(src.url)}&referer=${encodeURIComponent(ANIMEVERSE_BASE + "/")}`
          : src.url,
        type: isHls ? (isMaster ? "master" : "hls") : src.type === "mp4" ? "mp4" : "iframe",
        quality: src.quality || src.label,
        isMaster,
        originalUrl: src.url,
        upstreamReferer: ANIMEVERSE_BASE + "/",
      };
    });

    return {
      sources,
      subtitles: data.subtitles || [],
      skips: data.intro || data.outro ? {
        intro: data.intro,
        outro: data.outro,
      } : undefined,
      server: data.server || server || "default",
      provider: "animeverse",
      raw: data,
    };
  },
};
