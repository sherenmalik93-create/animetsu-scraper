/**
 * AnimeKhor provider — wraps https://animekhor.org/
 *
 * AnimeKhor is a Chinese anime/Donghua streaming site built on WordPress
 * with the Themesia AnimeStream theme. It focuses on Donghua (Chinese anime)
 * with English and Indonesian subtitles.
 *
 * URL structure (WordPress + AnimeStream theme patterns):
 *   /                              — home
 *   /anime/                        — anime catalog (paginated)
 *   /anime/?page=N&status=&type=&order=update  — catalog with filters
 *   /anime/{slug}                  — anime detail page (series page)
 *   /{slug}-episode-{n}-subtitles-english-indonesian  — episode page
 *   /a-z-lists                     — alphabetical listing
 *
 * The AnimeStream theme by Themesia uses WordPress's REST API and custom
 * AJAX endpoints. Episode pages embed video players (typically gogoplay,
 * streamtape, mixdrop, etc.) via iframes.
 *
 * Because the site sits behind Cloudflare's JS challenge, we use curl for
 * all HTTP requests. HTML parsing extracts metadata and streaming URLs.
 *
 * ID format: slug-based, e.g. "b-king" or "log-in-with-max-level"
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
import { execSync } from "node:child_process";

const AK_BASE = "https://animekhor.org";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/* ------------------------------------------------------------------ */
/*  Cloudflare-bypass HTTP helper (curl)                               */
/* ------------------------------------------------------------------ */

function curlGet(url: string): string | null {
  try {
    const result = execSync(
      `curl -sL --max-time 15 ` +
      `-H "User-Agent: ${BROWSER_UA}" ` +
      `-H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" ` +
      `-H "Accept-Language: en-US,en;q=0.9" ` +
      `-H "Referer: ${AK_BASE}/" ` +
      `--compressed ` +
      `"${url}"`,
      { encoding: "utf-8", timeout: 20000, maxBuffer: 5 * 1024 * 1024 }
    );
    return result || null;
  } catch (err) {
    console.error(`[animekhor] curl failed for ${url}:`, (err as Error).message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  HTML parsing helpers                                               */
/* ------------------------------------------------------------------ */

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Extract src from iframe tags. */
function extractIframes(html: string): string[] {
  const re = /<iframe[^>]*?\bsrc=["']([^"']+)["']/gi;
  const results: string[] = [];
  let m;
  while ((m = re.exec(html)) !== null) results.push(m[1]);
  return results;
}

/** Parse anime cards from a listing page (Themesia AnimeStream pattern). */
function parseAnimeCards(html: string): Array<{ slug: string; title: string; cover?: string }> {
  const results: Array<{ slug: string; title: string; cover?: string }> = [];

  // AnimeStream theme typically uses: <a href="/anime/{slug}">
  // with thumbnail images in .bsi-thumb or similar containers
  const cardRe = /<a[^>]*href="\/anime\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = cardRe.exec(html)) !== null) {
    const slug = match[1];
    const block = match[2];

    // Skip pagination/duplicate slugs
    if (slug.includes("?") || slug.includes("#")) continue;

    // Extract title - usually in a span or as text
    const titleMatch = block.match(/<span[^>]*>([^<]+)<\/span>/)
      || block.match(/title="([^"]+)"/)
      || block.match(/>([^<]{3,100})</);
    const title = titleMatch
      ? decodeHTMLEntities(titleMatch[1].trim())
      : slug.replace(/-/g, " ");

    // Extract cover image
    const imgMatch = block.match(/src="([^"]+)"/);
    const cover = imgMatch && !imgMatch[1].startsWith("data:") ? imgMatch[1] : undefined;

    // Deduplicate by slug
    if (!results.some(r => r.slug === slug)) {
      results.push({ slug, title, cover });
    }
  }

  return results;
}

/** Parse episode list from anime detail page. */
function parseEpisodes(html: string, slug: string): UnifiedEpisode[] {
  const episodes: UnifiedEpisode[] = [];
  const epNums = new Set<string>();

  // Pattern 1: Direct episode links in the page
  // AnimeKhor uses: /{slug}-episode-{n}-subtitles-english-indonesian
  const epRe1 = /href="[^"]*\/[^"]*-episode-(\d+)[^"]*"/gi;
  let m;
  while ((m = epRe1.exec(html)) !== null) {
    epNums.add(m[1]);
  }

  // Pattern 2: Episode list items (numbered)
  const epRe2 = /<li[^>]*class="[^"]*ep[^"]*"[^>]*>[\s\S]*?(\d+)/gi;
  while ((m = epRe2.exec(html)) !== null) {
    epNums.add(m[1]);
  }

  // Pattern 3: eplistdata or data attributes
  const epRe3 = /data-(?:episode|ep)-?(?:num|id)?="(\d+)"/gi;
  while ((m = epRe3.exec(html)) !== null) {
    epNums.add(m[1]);
  }

  // Pattern 4: Generic "Episode N" text patterns
  if (epNums.size === 0) {
    const epRe4 = /Episode\s+(\d+)/gi;
    while ((m = epRe4.exec(html)) !== null) {
      epNums.add(m[1]);
    }
  }

  // Pattern 5: Total episode count from metadata
  if (epNums.size === 0) {
    const totalMatch = html.match(/(?:episodes?|eps?|total)[\s:]*(\d+)/i);
    if (totalMatch) {
      const total = parseInt(totalMatch[1]);
      for (let i = 1; i <= Math.min(total, 200); i++) {
        epNums.add(String(i));
      }
    }
  }

  const sorted = [...epNums].sort((a, b) => Number(a) - Number(b));

  for (const epStr of sorted) {
    const num = Number(epStr);
    if (isNaN(num) || num <= 0) continue;
    episodes.push({
      number: num,
      displayNumber: epStr,
      sourceId: `${slug}:ep${epStr}`,
      variants: ["sub"],
    });
  }

  return episodes;
}

/** Parse streaming sources from an episode page. */
function parseSources(html: string, epNum: number): UnifiedSources {
  const sources: UnifiedStreamSource[] = [];

  // Extract all iframes — these are the streaming embeds
  const iframes = extractIframes(html);

  for (const src of iframes) {
    const fullUrl = src.startsWith("http") ? src : `${AK_BASE}${src}`;

    // Skip non-video iframes (ads, analytics, etc.)
    if (/google|facebook|twitter|disqus|analytics|doubleclick/i.test(fullUrl)) continue;

    // Classify the source based on known patterns
    let type: UnifiedStreamSource["type"] = "iframe";
    let quality: string | undefined;

    if (/streamtape/i.test(fullUrl)) quality = "StreamTape";
    else if (/vidstream|gogoplay|rapidcdn/i.test(fullUrl)) quality = "VidStreaming";
    else if (/filemoon/i.test(fullUrl)) quality = "FileMoon";
    else if (/mp4upload/i.test(fullUrl)) quality = "MP4Upload";
    else if (/mixdrop/i.test(fullUrl)) quality = "MixDrop";
    else if (/doodstream/i.test(fullUrl)) quality = "DoodStream";
    else if (/streamlare/i.test(fullUrl)) quality = "StreamLare";
    else if (/hd-1|hd-2|server/i.test(fullUrl)) quality = "HD Server";
    else quality = "Embed";

    // Check if it's a direct m3u8/mp4
    const isHls = /\.m3u8/i.test(fullUrl);
    const isMp4 = /\.mp4/i.test(fullUrl);

    if (isHls) {
      type = "master";
      quality = "Auto";
    } else if (isMp4) {
      type = "mp4";
      quality = "MP4";
    }

    // Route HLS through our proxy
    const url = isHls
      ? `/api/proxy/m3u8?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(AK_BASE + "/")}`
      : fullUrl;

    sources.push({
      url,
      type,
      quality,
      originalUrl: fullUrl,
      upstreamReferer: AK_BASE + "/",
    });
  }

  // Also look for direct video/source URLs
  const videoRe = /(?:src|source|url|file)["']?\s*[:=]\s*["']([^"']*(?:\.m3u8|\.mp4)[^"']*)/gi;
  let vMatch;
  while ((vMatch = videoRe.exec(html)) !== null) {
    const vUrl = vMatch[1];
    if (!vUrl.startsWith("http")) continue;
    if (sources.some(s => s.originalUrl === vUrl)) continue;

    const isHls = vUrl.includes(".m3u8");
    sources.push({
      url: isHls
        ? `/api/proxy/m3u8?url=${encodeURIComponent(vUrl)}&referer=${encodeURIComponent(AK_BASE + "/")}`
        : vUrl,
      type: isHls ? "master" : "mp4",
      quality: isHls ? "Auto" : "MP4",
      originalUrl: vUrl,
      upstreamReferer: AK_BASE + "/",
    });
  }

  return {
    sources,
    subtitles: [],
    server: sources.length > 0 ? "multi" : "unknown",
    provider: "animekhor",
  };
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
 * Parse an animekhor ID. Supports:
 *   - Slug: "b-king"
 *   - Prefixed: "animekhor:b-king"
 *   - AniList universal: "al:154587"
 */
function parseAnimekhorId(id: string): string | null {
  if (id.startsWith("animekhor:")) return id.slice(10);
  if (id.startsWith("al:")) return null; // Needs resolution
  return id;
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                            */
/* ------------------------------------------------------------------ */

export const animekhorProvider: Provider = {
  meta: {
    id: "animekhor",
    label: "AnimeKhor",
    description: "Donghua specialist · Sub (EN+ID) · Multi-server · Cloudflare-protected",
    accent: "from-amber-500 to-orange-600",
    supportsDub: false,
    defaultServer: "default",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];

    // Try fetching search page via curl
    // AnimeStream theme uses: /anime/?s={query} or /?s={query}
    const html = curlGet(`${AK_BASE}/anime/?s=${encodeURIComponent(query)}`);

    if (html && !html.includes("Cloudflare") && html.length > 1000) {
      const cards = parseAnimeCards(html);
      if (cards.length > 0) {
        return cards.map((c) => ({
          id: c.slug,
          title: { english: c.title, preferred: c.title },
          coverImage: c.cover ? { large: c.cover } : undefined,
        }));
      }
    }

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
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    const slug = parseAnimekhorId(id);

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
        coverImage: { large: alData.coverImage?.large },
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

    // Direct slug — fetch from animekhor
    const html = curlGet(`${AK_BASE}/anime/${encodeURIComponent(slug)}`);
    if (!html || html.includes("Cloudflare")) return null;

    // Parse title (og:title is usually clean)
    const titleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)
      || html.match(/<title[^>]*>([^<]+)/);
    const rawTitle = titleMatch
      ? decodeHTMLEntities(titleMatch[1].replace(/\s*[|\-–].*$/, "").trim())
      : slug.replace(/-/g, " ");

    // Parse cover image (og:image)
    const coverMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i)
      || html.match(/<img[^>]*class="[^"]*thumb[^"]*"[^>]*src="([^"]+)"/i);
    const cover = coverMatch ? coverMatch[1] : undefined;

    // Parse description (og:description)
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)
      || html.match(/<div[^>]*class="[^"]*(?:synopsis|description|entry-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const description = descMatch ? decodeHTMLEntities(descMatch[1].replace(/<[^>]+>/g, "").trim()) : undefined;

    // Parse genre/type info
    const genreMatch = html.match(/<div[^>]*class="[^"]*genxed[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
      || html.match(/<span[^>]*class="[^"]*genre[^"]*"[^>]*>([\s\S]*?)<\/span>/gi);
    const genres = genreMatch
      ? [...genreMatch[1].matchAll(/>([^<]+)</g)].map(m => m[1].trim())
      : undefined;

    // Parse status
    const statusMatch = html.match(/(?:status|state)[\s:]*([A-Za-z]+)/i);
    const status = statusMatch ? statusMatch[1] : undefined;

    return {
      id: slug,
      title: { english: rawTitle, preferred: rawTitle },
      coverImage: cover ? { large: cover } : undefined,
      description,
      genres,
      status,
    };
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const slug = parseAnimekhorId(id);

    if (!slug) {
      // For AniList IDs, generate synthetic episode list
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

    // Fetch anime detail page for episode list
    const cacheKey = `episodes:${slug}`;
    const cached = cacheGet<UnifiedEpisode[]>(cacheKey);
    if (cached) return cached;

    const html = curlGet(`${AK_BASE}/anime/${encodeURIComponent(slug)}`);
    if (!html || html.includes("Cloudflare")) return [];

    const episodes = parseEpisodes(html, slug);
    return cacheSet(cacheKey, episodes);
  },

  async getServers(id: string, epNum: number): Promise<UnifiedServer[]> {
    // AnimeKhor typically provides multiple embed servers
    return [
      { id: "default", label: "Default", default: true },
      { id: "vidstreaming", label: "VidStreaming" },
      { id: "streamtape", label: "StreamTape" },
      { id: "mixdrop", label: "MixDrop" },
      { id: "filemoon", label: "FileMoon" },
    ];
  },

  async getSources(opts: {
    id: string;
    epNum: number;
    server?: string;
    sourceType?: "sub" | "dub";
  }): Promise<UnifiedSources> {
    const { id, epNum, server, sourceType = "sub" } = opts;
    const slug = parseAnimekhorId(id);

    if (!slug) {
      return { sources: [], subtitles: [], server: server || "default", provider: "animekhor" };
    }

    // AnimeKhor episode URL: /{slug}-episode-{n}-subtitles-english-indonesian
    const epSlug = `${slug}-episode-${epNum}-subtitles-english-indonesian`;
    const cacheKey = `sources:${epSlug}`;
    const cached = cacheGet<UnifiedSources>(cacheKey);
    if (cached) return cached;

    const html = curlGet(`${AK_BASE}/${encodeURIComponent(epSlug)}`);
    if (!html || html.includes("Cloudflare")) {
      // Try alternative URL pattern (some episodes don't have the full suffix)
      const altSlug = `${slug}-episode-${epNum}`;
      const altHtml = curlGet(`${AK_BASE}/${encodeURIComponent(altSlug)}`);
      if (!altHtml || altHtml.includes("Cloudflare")) {
        return { sources: [], subtitles: [], server: server || "default", provider: "animekhor" };
      }
      const result = parseSources(altHtml, epNum);
      if (server && server !== "default") {
        result.sources = result.sources.filter(
          (s) => s.quality?.toLowerCase().includes(server.toLowerCase())
        );
      }
      return cacheSet(cacheKey, result);
    }

    const result = parseSources(html, epNum);

    // Filter by requested server if specified
    if (server && server !== "default") {
      result.sources = result.sources.filter(
        (s) => s.quality?.toLowerCase().includes(server.toLowerCase())
      );
    }

    return cacheSet(cacheKey, result);
  },
};
