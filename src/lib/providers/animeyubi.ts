/**
 * Animeyubi provider
 *
 * Animeyubi.com exposes a clean Django REST API at `/api/v4/*` that mirrors
 * the AnimePahe catalog. Each anime entry has a list of episodes, and each
 * episode returns a list of `videos` whose URLs are `kwik.cx/f/<id>` (MP4
 * file page) or `kwik.cx/e/<id>` (HLS embed page).
 *
 * Kwik.cx is hard-Cloudflare-protected from server-side scraping, so we
 * can't extract the underlying m3u8/mp4 ourselves. Instead, we surface the
 * kwik.cx embed URL as an `iframe` source and let the browser render it
 * directly — the user's browser has CF cookies and the iframe player is
 * kwik's own, so playback works.
 *
 * API summary:
 *   GET /api/v4/pahe/anime/?format=json&title=<q>&limit=N   → search
 *   GET /api/v4/pahe/anime/<id>/?format=json                 → anime + episode list
 *   GET /api/v4/pahe/episodes/<epId>/?format=json            → videos (kwik URLs)
 *
 * Sub/Dub detection: video titles ending in `eng` are English-dubbed.
 */

import type {
  Provider,
  UnifiedSearchResult,
  UnifiedEpisode,
  UnifiedServer,
  UnifiedSources,
  UnifiedStreamSource,
} from "./types";

const ANIMEYUBI_BASE =
  process.env.ANIMEYUBI_BASE || "https://animeyubi.com";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** In-process cache so the anime-info call isn't repeated for every episode. */
const cache = new Map<string, { t: number; v: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

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
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  return v;
}

export const animeyubiProvider: Provider = {
  meta: {
    id: "animeyubi",
    label: "Animeyubi",
    description: "AnimePahe mirror · Sub/Dub · Kwik embeds",
    accent: "from-emerald-500 to-teal-500",
    supportsDub: true,
    defaultServer: "kwik-mp4",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];
    const url = `${ANIMEYUBI_BASE}/api/v4/pahe/anime/?format=json&title=${encodeURIComponent(query)}&limit=30`;
    const payload = await fetchJson<AnimeyubiSearchPayload>(url);
    const items = payload?.results || [];
    return items.map((m) => ({
      id: String(m.id),
      title: {
        preferred: m.title,
        english: m.title,
        romaji: m.title,
      },
      coverImage: {
        large: m.image,
        cover: m.image,
      },
      banner: m.image,
    }));
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    const anime = await fetchAnimeInfo(id);
    if (!anime) return null;
    return mapAnimeInfo(anime);
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const anime = await fetchAnimeInfo(id);
    if (!anime?.episodes) return [];
    // Animeyubi episode `title` is the episode number as a string (e.g. "1", "2", "1.5")
    // and the episode `id` is what we need to fetch sources. We sort by numeric value.
    return [...anime.episodes]
      .map((e) => {
        const num = parseFloat(e.title);
        return {
          e,
          num: Number.isFinite(num) ? num : 0,
        };
      })
      .sort((a, b) => a.num - b.num)
      .map(({ e, num }) => ({
        number: num,
        displayNumber: e.title,
        // Source id encodes both the anime id and the episode id so that
        // getSources() can resolve the episode without another fetch.
        sourceId: `${id}:${e.id}`,
        airedAt: e.last_updated,
        variants: ["sub", "dub"],
      }));
  },

  async getServers(_id: string, _epNum: number): Promise<UnifiedServer[]> {
    return [
      {
        id: "kwik-mp4",
        label: "Kwik · MP4",
        description: "Direct MP4 embeds · multi-quality",
        default: true,
      },
      {
        id: "kwik-hls",
        label: "Kwik · HLS",
        description: "Adaptive HLS embeds",
      },
    ];
  },

  async getSources(opts): Promise<UnifiedSources> {
    const { id, epNum, server = "kwik-mp4", sourceType = "sub" } = opts;

    // 1. Resolve the episode's kwik videos
    const epId = await findEpisodeId(id, epNum);
    if (!epId) {
      return {
        sources: [],
        subtitles: [],
        server,
        provider: "animeyubi",
      };
    }

    const epUrl = `${ANIMEYUBI_BASE}/api/v4/pahe/episodes/${encodeURIComponent(epId)}/?format=json`;
    const ep = await fetchJson<AnimeyubiEpisodePayload>(epUrl);
    const videos = ep?.videos || [];

    // 2. Filter to the requested audio variant.
    //    Video titles use a trailing "eng" to mark English dub.
    const wantDub = sourceType === "dub";
    const filtered = videos.filter((v) => {
      const isEng = /\beng\b/i.test(v.title || "");
      return wantDub ? isEng : !isEng;
    });
    const pool = filtered.length > 0 ? filtered : videos;

    // 3. Filter by server preference (mp4 = /f/, hls = /e/)
    const wantHls = server === "kwik-hls";
    const matched = pool.filter((v) => {
      const isHls = /\/e\//i.test(v.url) || v.video_type === "hls";
      return wantHls ? isHls : !isHls;
    });
    const finalPool = matched.length > 0 ? matched : pool;

    // 4. Build unified sources. All kwik.cx URLs go through as iframe embeds
    //    because they're CF-protected from server-side scraping.
    const sources: UnifiedStreamSource[] = finalPool
      .map((v) => ({
        url: v.url,
        type: "iframe" as const,
        quality: parseQuality(v.title),
        originalUrl: v.url,
        upstreamReferer: "https://animepahe.ru/",
      }))
      // Sort by quality descending (1080p first)
      .sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));

    /**
     * Raw upstream payload — the full animeyubi episode document, including:
     *   - All videos (sub + dub, mp4 + hls) with their kwik.cx URLs
     *   - Episode metadata (title, id, next/previous pointers)
     *   - The full anime document (synopsis, genres, episode list, studios)
     *
     * This is what the UI's "Show raw response" panel surfaces so developers
     * can see exactly what animeyubi returned before normalization.
     */
    const rawPayload = {
      provider: "animeyubi",
      api: `${ANIMEYUBI_BASE}/api/v4/pahe/episodes/${epId}/`,
      animeId: id,
      episodeId: epId,
      episodeNumber: epNum,
      streamType: sourceType,
      server,
      episode: ep,
      // Re-shape into the user's preferred MegaPlay-style format so the
      // raw panel is easy to scan — one entry per (sub/dub, mp4/hls) combo
      // with hls_url / mp4_url / embed_url / subtitles / variants fields.
      normalized: videos.map((v) => ({
        anilist_id: null, // animeyubi doesn't expose AniList IDs
        episode: epNum,
        stream_type: /\beng\b/i.test(v.title || "") ? "dub" : "sub",
        provider: "Kwik",
        server_id: v.id,
        cdn_host: "kwik.cx",
        hls_url: v.video_type === "hls" ? v.url : null,
        mp4_url: v.video_type === "mp4" ? v.url : null,
        rmvb_url: null,
        stream_format: v.video_type,
        quality: parseQuality(v.title),
        embed_url: v.url,
        video_title: v.title,
        errors: v.errors,
      })),
    };

    return {
      sources,
      subtitles: [],
      server,
      provider: "animeyubi",
      raw: rawPayload,
    };
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: "https://animeyubi.com/",
        Accept: "application/json",
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Fetch and cache the full anime document (includes episode list). */
async function fetchAnimeInfo(id: string): Promise<AnimeyubiAnime | null> {
  const cacheKey = `anime:${id}`;
  const cached = cacheGet<AnimeyubiAnime>(cacheKey);
  if (cached) return cached;

  const url = `${ANIMEYUBI_BASE}/api/v4/pahe/anime/${encodeURIComponent(id)}/?format=json`;
  const data = await fetchJson<AnimeyubiAnime>(url);
  if (!data) return null;
  return cacheSet(cacheKey, data);
}

/** Resolve the animeyubi episode id for a given (animeId, epNum). */
async function findEpisodeId(animeId: string, epNum: number): Promise<string | null> {
  const anime = await fetchAnimeInfo(animeId);
  if (!anime?.episodes) return null;
  // Try exact match on numeric title first, then closest
  const exact = anime.episodes.find((e) => parseFloat(e.title) === epNum);
  if (exact) return String(exact.id);
  // Fall back: episodes might be 0-indexed or have different numbering
  const idx = Math.max(0, Math.floor(epNum) - 1);
  return String(anime.episodes[idx]?.id || "");
}

function mapAnimeInfo(a: AnimeyubiAnime): UnifiedSearchResult {
  const genres = (a.genres || []).map((g) => g.title).filter(Boolean);
  return {
    id: String(a.id),
    title: {
      preferred: a.title,
      english: a.jp_title || a.title,
      romaji: a.title_romaji || a.title,
      native: a.jp_title,
    },
    coverImage: {
      large: a.image,
      cover: a.image,
    },
    banner: a.image,
    description: a.synopsis,
    status: a.anime_type,
    year: a.aired ? new Date(a.aired).getFullYear() : undefined,
    format: a.anime_type,
    genres,
    season: a.season ? String(a.season) : undefined,
  };
}

/** Pull a quality label out of strings like "SEV · 1080p BD eng". */
function parseQuality(title: string | undefined): string {
  if (!title) return "default";
  const m = title.match(/(\d{3,4}p)/i);
  if (m) return m[1].toLowerCase();
  const bd = /bd/i.test(title);
  return bd ? "BD" : "default";
}

/** Higher = better. Used to sort sources so 1080p wins over 360p. */
function qualityRank(q: string | undefined): number {
  if (!q) return 0;
  const m = q.match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : /bd/i.test(q) ? 720 : 0;
}

/* ------------------------------------------------------------------ */
/*  Upstream type shapes (only what we read)                          */
/* ------------------------------------------------------------------ */

interface AnimeyubiSearchPayload {
  count?: number;
  results?: Array<{
    unique_id: string;
    id: number;
    image: string;
    title: string;
    last_updated: string;
  }>;
}

interface AnimeyubiAnime {
  id: number;
  unique_id?: string;
  title: string;
  jp_title?: string;
  title_romaji?: string;
  synopsis?: string;
  synonyms?: string;
  image: string;
  aired?: string;
  anime_type?: string;
  season?: number;
  genres?: Array<{ id: number; title: string }>;
  episodes?: Array<{ title: string; id: number; last_updated?: string }>;
}

interface AnimeyubiEpisodeVideo {
  title: string;
  id: number;
  video_type: "mp4" | "hls" | string;
  url: string;
  errors: number;
}

interface AnimeyubiEpisodePayload {
  title: string;
  id: number;
  videos: AnimeyubiEpisodeVideo[];
  next?: { title: string; id: number } | null;
  previous?: { title: string; id: number } | null;
  anime?: AnimeyubiAnime;
}
