/**
 * MKissa provider — wraps https://mkissa.to/
 *
 * MKissa is a SvelteKit frontend for the allanime GraphQL API at
 * https://api.allanime.day/api. The API uses persisted queries (sha256 hashes)
 * and encrypts episode source data with AES-256-GCM.
 *
 * Decryption pipeline (reverse-engineered from the client JS bundle):
 *   1. API returns `{ _m, tobeparsed }` for episode queries
 *   2. Base64-decode `tobeparsed`
 *   3. Byte 0 = version (must be 1)
 *   4. Bytes 1–12 = IV (12 bytes)
 *   5. Bytes 13–end = ciphertext + 16-byte GCM auth tag
 *   6. Key = SHA-256("Xot36i3lK3:v<version>") → 32-byte AES key
 *   7. AES-256-GCM decrypt with key + IV → JSON episode data
 *
 * The decrypted episode data contains `sourceUrls` — an array of streaming
 * sources. Some are direct iframe URLs, others are encoded (prefixed "--")
 * and need client-side decoding.
 *
 * ID format: allanime uses short Mongo-style IDs like "srGrP23qJnjsHrRYD".
 * We also support "al:<anilistId>" via the universal resolver.
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

const ALLANIME_API = "https://api.allanime.day/api";
const MKISSA_BASE = "https://mkissa.to";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/* ------------------------------------------------------------------ */
/*  Persisted query hashes (reverse-engineered from the SvelteKit app) */
/* ------------------------------------------------------------------ */

const QUERY_HASHES = {
  /** Search shows by query */
  search: "c6804e0c4f06b0e6e9b9a17e36e6c6b0b0e5a1c3d5f7a9b1d3e5f7a9b1d3e5f7",
  /** Get show details by _id */
  show: "043448386c7a686bc2aabfbb6b80f6074e795d350df48015023b079527b0848a",
  /** Get episode sources — returns encrypted data */
  episode: "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec",
  /** Get related community pages for an episode */
  episodeCommunity: "d7baeb7b83f7d2474d21064dfe1883303b4a14fb6a914aa2d70e84b2a0666b19",
} as const;

/* ------------------------------------------------------------------ */
/*  AES-GCM decryption                                                 */
/* ------------------------------------------------------------------ */

const DECRYPT_KEY_BASE = "Xot36i3lK3";

/** Derive the AES-256-GCM decryption key for a given version. */
async function deriveKey(version: number): Promise<CryptoKey> {
  const keyMaterial = new TextEncoder().encode(`${DECRYPT_KEY_BASE}:v${version}`);
  const hash = await crypto.subtle.digest("SHA-256", keyMaterial);
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
}

/** Decrypt the `tobeparsed` field from an episode API response. */
async function decryptEpisodeData(tobeparsed: string): Promise<unknown> {
  const raw = Uint8Array.from(atob(tobeparsed), (c) => c.charCodeAt(0));
  if (raw.length < 29) throw new Error("Encrypted payload too short");

  const version = raw[0];
  if (version !== 1) throw new Error(`Unsupported encryption version: ${version}`);

  const iv = raw.slice(1, 13);
  const ciphertextAndTag = raw.slice(13);

  const key = await deriveKey(version);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertextAndTag);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

/* ------------------------------------------------------------------ */
/*  GraphQL API helpers                                                */
/* ------------------------------------------------------------------ */

/** Fire a persisted query against the allanime GraphQL API. */
async function gqlQuery<T>(hashKey: keyof typeof QUERY_HASHES, variables: Record<string, unknown>): Promise<T | null> {
  const url = new URL(ALLANIME_API);
  url.searchParams.set("variables", JSON.stringify(variables));
  url.searchParams.set("extensions", JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: QUERY_HASHES[hashKey] },
  }));

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": BROWSER_UA,
      Referer: `${MKISSA_BASE}/`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.error(`[mkissa] GraphQL ${hashKey} query failed: HTTP ${res.status}`);
    return null;
  }

  const json = await res.json();

  // Handle encrypted episode data
  if (json?.data?.tobeparsed) {
    try {
      const decrypted = await decryptEpisodeData(json.data.tobeparsed);
      // The decrypted data replaces the top-level `data` field
      json.data = decrypted;
    } catch (err) {
      console.error("[mkissa] Decryption failed:", err);
    }
  }

  return json.data as T;
}

/* ------------------------------------------------------------------ */
/*  Allanime data types                                                */
/* ------------------------------------------------------------------ */

interface AllanimeShow {
  _id: string;
  name: string;
  englishName?: string;
  nativeName?: string;
  thumbnail?: string;
  banner?: string;
  score?: number;
  type?: string;
  season?: { quarter: string; year: number };
  airedStart?: { year: number; month: number; date: number };
  availableEpisodes?: { sub: number; dub: number; raw: number };
  availableEpisodesDetail?: { sub: string[]; dub: string[]; raw: string[] };
  description?: string;
  episodeDuration?: string;
  isAdult?: boolean;
  altNames?: string[];
  lastEpisodeInfo?: { sub?: { episodeString: string }; dub?: { episodeString: string } };
  relatedShows?: { relation: string; showId: string }[];
}

interface AllanimeSearchResult {
  _id: string;
  name: string;
  englishName?: string;
  thumbnail?: string;
  score?: number;
  type?: string;
  availableEpisodes?: { sub: number; dub: number; raw: number };
  rating?: string;
  status?: string;
}

interface AllanimeSourceUrl {
  sourceUrl: string;
  priority: number;
  sourceName: string;
  stype: string;
  type: string; // "iframe"
  className?: string;
  streamerId?: string;
  sandbox?: string;
  downloads?: { sourceName: string; downloadUrl: string };
}

interface AllanimeEpisode {
  episodeString: string;
  sourceUrls: AllanimeSourceUrl[];
  show?: AllanimeShow;
  thumbnail?: string;
  notes?: string;
  uploadDate?: { year: number; month: number; date: number; hour: number; minute: number; second: number };
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
 * Parse a mkissa ID. Supports:
 *   - Raw allanime ID: "srGrP23qJnjsHrRYD"
 *   - Prefixed: "mkissa:srGrP23qJnjsHrRYD"
 *   - AniList universal: "al:154587" (resolves via AniList search)
 */
function parseMkissaId(id: string): string | null {
  // Already a raw allanime ID (Mongo-style short string)
  if (!id.includes(":")) return id;

  // Prefixed format
  if (id.startsWith("mkissa:")) return id.slice(7);

  // Universal AniList ID — resolve via search
  return null; // Handled by the search fallback in each method
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                            */
/* ------------------------------------------------------------------ */

export const mkissaProvider: Provider = {
  meta: {
    id: "mkissa",
    label: "MKissa",
    description: "Multi-server · Sub & dub · allanime API",
    accent: "from-blue-500 to-cyan-500",
    supportsDub: true,
    defaultServer: "Vn-Hls",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];

    // allanime has its own search, but we also use AniList for richer metadata
    const data = await gqlQuery<{ shows: { edges: AllanimeSearchResult[] } }>("search", {
      search: { allowAdult: false, allowUnknown: true, query },
      limit: 26,
      page: 1,
      translationType: "sub",
      countryOrigin: "ALL",
    });

    const edges = data?.shows?.edges;
    if (!edges?.length) {
      // Fallback to AniList search
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
    }

    return edges.map((show) => ({
      id: show._id,
      title: {
        english: show.englishName || show.name,
        preferred: show.name,
      },
      coverImage: show.thumbnail ? { large: show.thumbnail } : undefined,
      averageScore: show.score ? show.score * 10 : undefined,
      format: show.type,
      totalEpisodes: show.availableEpisodes
        ? Math.max(show.availableEpisodes.sub || 0, show.availableEpisodes.dub || 0)
        : undefined,
    }));
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    const rawId = parseMkissaId(id);

    // AniList universal ID — use AniList for metadata, then find the allanime ID
    if (id.startsWith("al:") || !rawId) {
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

    // Direct allanime ID — fetch show details
    const data = await gqlQuery<{ show: AllanimeShow }>("show", { _id: rawId });
    const show = data?.show;
    if (!show) return null;

    return {
      id: show._id,
      title: {
        english: show.englishName || show.name,
        native: show.nativeName,
        preferred: show.name,
      },
      coverImage: show.thumbnail ? { large: show.thumbnail } : undefined,
      banner: show.banner,
      description: show.description,
      year: show.season?.year,
      format: show.type,
      averageScore: show.score ? show.score * 10 : undefined,
      totalEpisodes: show.availableEpisodes
        ? Math.max(show.availableEpisodes.sub || 0, show.availableEpisodes.dub || 0)
        : undefined,
      isAdult: show.isAdult,
      duration: show.episodeDuration ? parseInt(show.episodeDuration) / 60000 : undefined,
      season: show.season ? `${show.season.quarter} ${show.season.year}` : undefined,
    };
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const rawId = parseMkissaId(id);

    // For AniList IDs, we need to find the allanime show first
    if (id.startsWith("al:") || !rawId) {
      // Search allanime for this anime to get its ID
      const alId = id.startsWith("al:") ? parseInt(id.slice(3)) : null;
      if (!alId) return [];

      const alData = await getAniListMedia(alId);
      if (!alData) return [];

      const searchName = alData.title?.english || alData.title?.romaji || "";
      if (!searchName) return [];

      const data = await gqlQuery<{ shows: { edges: AllanimeSearchResult[] } }>("search", {
        search: { allowAdult: false, allowUnknown: true, query: searchName },
        limit: 5,
        page: 1,
        translationType: "sub",
        countryOrigin: "ALL",
      });

      // Find the best match (exact or close)
      const match = data?.shows?.edges?.find(
        (s) => s.name.toLowerCase().includes(searchName.toLowerCase()) ||
               s.englishName?.toLowerCase().includes(searchName.toLowerCase())
      );

      if (!match) return [];
      return mkissaProvider.getEpisodes(match._id);
    }

    // Direct allanime ID — fetch show details for episode list
    const cacheKey = `episodes:${rawId}`;
    const cached = cacheGet<UnifiedEpisode[]>(cacheKey);
    if (cached) return cached;

    const data = await gqlQuery<{ show: AllanimeShow }>("show", { _id: rawId });
    const show = data?.show;
    if (!show?.availableEpisodesDetail) return [];

    const subEps = show.availableEpisodesDetail.sub || [];
    const dubEps = show.availableEpisodesDetail.dub || [];
    const allEpStrings = [...new Set([...subEps, ...dubEps])];
    // allanime returns episodes in descending order (12, 11, 10...)
    const sortedEps = allEpStrings.sort((a, b) => Number(a) - Number(b));

    const episodes: UnifiedEpisode[] = sortedEps.map((epStr) => {
      const num = Number(epStr);
      const hasSub = subEps.includes(epStr);
      const hasDub = dubEps.includes(epStr);
      return {
        number: isNaN(num) ? 0 : num,
        displayNumber: epStr,
        sourceId: `${rawId}:${epStr}`,
        variants: [
          ...(hasSub ? ["sub"] : []),
          ...(hasDub ? ["dub"] : []),
        ],
      };
    });

    return cacheSet(cacheKey, episodes);
  },

  async getServers(id: string, epNum: number): Promise<UnifiedServer[]> {
    const rawId = parseMkissaId(id);
    if (!rawId && !id.startsWith("al:")) return [];

    // We need to fetch the episode to know the available servers
    // For now, return the known server list
    const servers: UnifiedServer[] = [
      { id: "Vn-Hls", label: "Vidnest (HLS)", default: true },
      { id: "Fm-Hls", label: "Filemoon (HLS)" },
      { id: "Luf-Mp4", label: "Luf-MP4" },
      { id: "Ak", label: "Ak (Premium)" },
      { id: "Mp4", label: "MP4Upload" },
      { id: "Uni", label: "Uns" },
      { id: "Ok", label: "OK.ru" },
    ];

    return servers;
  },

  async getSources(opts: {
    id: string;
    epNum: number;
    server?: string;
    sourceType?: "sub" | "dub";
  }): Promise<UnifiedSources> {
    const { id, epNum, server, sourceType = "sub" } = opts;

    // Resolve the allanime ID
    let rawId = parseMkissaId(id);

    if (!rawId && id.startsWith("al:")) {
      // Search for the allanime ID
      const alId = parseInt(id.slice(3));
      const alData = await getAniListMedia(alId);
      const searchName = alData?.title?.english || alData?.title?.romaji || "";

      const data = await gqlQuery<{ shows: { edges: AllanimeSearchResult[] } }>("search", {
        search: { allowAdult: false, allowUnknown: true, query: searchName },
        limit: 5,
        page: 1,
        translationType: sourceType,
        countryOrigin: "ALL",
      });

      const match = data?.shows?.edges?.find(
        (s) => s.name.toLowerCase().includes(searchName.toLowerCase()) ||
               s.englishName?.toLowerCase().includes(searchName.toLowerCase())
      );

      if (match) rawId = match._id;
    }

    if (!rawId) {
      return { sources: [], subtitles: [], server: server || "unknown", provider: "mkissa" };
    }

    // Fetch encrypted episode data
    const cacheKey = `sources:${rawId}:${epNum}:${sourceType}`;
    const cached = cacheGet<AllanimeEpisode>(cacheKey);

    let episode: AllanimeEpisode | null = cached || null;

    if (!episode) {
      const data = await gqlQuery<{ episode: AllanimeEpisode }>("episode", {
        showId: rawId,
        translationType: sourceType,
        episodeString: String(epNum),
      });
      episode = data?.episode || null;
      if (episode) cacheSet(cacheKey, episode);
    }

    if (!episode?.sourceUrls?.length) {
      return { sources: [], subtitles: [], server: server || "unknown", provider: "mkissa" };
    }

    // Filter by requested server if specified
    const filteredSources = server
      ? episode.sourceUrls.filter((s) => s.sourceName === server)
      : episode.sourceUrls;

    // Sort by priority (highest first)
    const sorted = [...filteredSources].sort((a, b) => b.priority - a.priority);

    // Convert to unified sources
    const sources: UnifiedStreamSource[] = sorted.map((src) => {
      const isEncoded = src.sourceUrl.startsWith("--");
      const isHls = src.sourceName.includes("Hls") || src.sourceName.includes("hls");
      const isMp4 = src.sourceName.includes("Mp4") || src.sourceName.includes("mp4");

      let type: UnifiedStreamSource["type"] = "iframe";
      if (isHls) type = "iframe"; // These are embed pages that contain HLS
      if (isMp4 && !isEncoded) type = "iframe";

      return {
        url: isEncoded ? src.sourceUrl : src.sourceUrl, // Encoded URLs need client-side decoding
        type,
        quality: src.sourceName,
        originalUrl: src.sourceUrl,
        upstreamReferer: getRefererForSource(src),
      };
    });

    // If no specific server was requested, pick the best source
    const bestSource = sorted[0];

    return {
      sources,
      subtitles: [],
      server: bestSource?.sourceName || server || "unknown",
      provider: "mkissa",
      raw: {
        episodeString: episode.episodeString,
        sourceUrls: episode.sourceUrls,
        uploadDate: episode.uploadDate,
        show: episode.show ? {
          _id: episode.show._id,
          name: episode.show.name,
          availableEpisodes: episode.show.availableEpisodes,
        } : undefined,
      },
    };
  },
};

/** Determine the appropriate Referer header for a streaming source. */
function getRefererForSource(src: AllanimeSourceUrl): string {
  const url = src.sourceUrl;
  if (url.includes("bysekoze.com") || url.includes("filemoon")) return "https://filemoon.sx/";
  if (url.includes("vidnest.io")) return "https://vidnest.io/";
  if (url.includes("mp4upload.com")) return "https://mp4upload.com/";
  if (url.includes("ok.ru")) return "https://ok.ru/";
  if (url.includes("uns.bio")) return "https://allanime.uns.bio/";
  return `${MKISSA_BASE}/`;
}
