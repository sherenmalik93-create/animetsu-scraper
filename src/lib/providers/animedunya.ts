/**
 * Anime-Dunya provider — wraps https://anime-dunya.com/
 *
 * Anime-Dunya is a multi-language anime streaming site (English + Farsi)
 * with a clean URL structure:
 *   /en/                          — home
 *   /en/animelist                 — anime catalog
 *   /en/popular                   — popular anime
 *   /en/updates                   — recently updated
 *   /en/season                    — seasonal anime
 *   /en/anime/{slug}              — anime detail page
 *   /en/watch/{slug}-episode-{n}  — episode watch page
 *
 * The site is built on a custom PHP/Laravel backend with HTML rendering.
 * Episode pages embed video iframes from multiple server sources
 * (typically gogoplay, streamtape, vidstreaming, etc.).
 *
 * Because the entire site sits behind Cloudflare's managed challenge,
 * we use curl for all HTTP requests (Node fetch gets 403'd by CF's
 * TLS fingerprinting). We parse the HTML responses with regex patterns
 * to extract anime metadata, episode lists, and streaming embed URLs.
 *
 * ID format: slug-based, e.g. "solo-leveling-season-2-arise-from-the-shadow"
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

const AD_BASE = "https://anime-dunya.com";

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
      `-H "Referer: ${AD_BASE}/" ` +
      `--compressed ` +
      `"${url}"`,
      { encoding: "utf-8", timeout: 20000, maxBuffer: 5 * 1024 * 1024 }
    );
    return result || null;
  } catch (err) {
    console.error(`[animedunya] curl failed for ${url}:`, (err as Error).message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  HTML parsing helpers                                               */
/* ------------------------------------------------------------------ */

/** Extract all text between two delimiters. */
function extractBetween(html: string, start: string, end: string): string {
  const si = html.indexOf(start);
  if (si === -1) return "";
  const ei = html.indexOf(end, si + start.length);
  if (ei === -1) return "";
  return html.slice(si + start.length, ei);
}

/** Extract an attribute value from a tag. */
function extractAttr(html: string, tag: string, attr: string): string[] {
  const re = new RegExp(`<${tag}[^>]*?${attr}=["']([^"']+)["']`, "gi");
  const results: string[] = [];
  let m;
  while ((m = re.exec(html)) !== null) results.push(m[1]);
  return results;
}

/** Extract src from iframe tags. */
function extractIframes(html: string): string[] {
  return extractAttr(html, "iframe", "src");
}

/** Extract anime data from the catalog/animelist page. */
function parseAnimeCards(html: string): Array<{ slug: string; title: string; cover?: string; url: string }> {
  const results: Array<{ slug: string; title: string; cover?: string; url: string }> = [];

  // Match anime card links: <a href="/en/anime/{slug}">
  const linkRe = /href="\/en\/anime\/([^"]+)"[^>]*>/gi;
  // Match titles in various patterns
  const titleRe = /<a[^>]*href="\/en\/anime\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  // Match images
  const imgRe = /<img[^>]*src="([^"]*(?:cover|thumb|image|poster)[^"]*)"[^>]*>/gi;

  // Simple card extraction
  const cardBlocks = html.split(/<a[^>]*href="\/en\/anime\//);
  for (let i = 1; i < cardBlocks.length; i++) {
    const block = cardBlocks[i];
    const slugEnd = block.indexOf('"');
    if (slugEnd === -1) continue;
    const slug = block.slice(0, slugEnd);

    // Try to get title
    const titleMatch = block.match(/>([^<]{2,100})</);
    const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, " ");

    // Try to get cover image
    const imgMatch = block.match(/src="([^"]+)"/);
    const cover = imgMatch ? imgMatch[1] : undefined;

    if (slug && slug.length > 2) {
      results.push({
        slug,
        title: decodeHTMLEntities(title),
        cover: cover && !cover.startsWith("data:") ? cover : undefined,
        url: `/en/anime/${slug}`,
      });
    }
  }

  return results;
}

/** Parse episode list from an anime detail page. */
function parseEpisodes(html: string, slug: string): UnifiedEpisode[] {
  const episodes: UnifiedEpisode[] = [];

  // Look for episode links: /en/watch/{slug}-episode-{n}
  const epRe = /href="\/en\/watch\/[^"]*-episode-(\d+[^"]*)"/gi;
  const epNums = new Set<string>();
  let m;
  while ((m = epRe.exec(html)) !== null) {
    epNums.add(m[1]);
  }

  // Also try data attributes or numbered lists
  if (epNums.size === 0) {
    // Try alternative patterns: episode buttons/links with numbers
    const altEpRe = /episode[_\s-]?(\d+)/gi;
    while ((m = altEpRe.exec(html)) !== null) {
      epNums.add(m[1]);
    }
  }

  // If still no episodes found, try total episode count from metadata
  if (epNums.size === 0) {
    const totalMatch = html.match(/(?:episodes?|eps?)[\s:]*(\d+)/i);
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

/** Parse streaming sources from an episode watch page. */
function parseSources(html: string, epNum: number): UnifiedSources {
  const sources: UnifiedStreamSource[] = [];

  // Extract all iframes — these are the streaming embeds
  const iframes = extractIframes(html);

  for (const src of iframes) {
    const fullUrl = src.startsWith("http") ? src : `${AD_BASE}${src}`;

    // Classify the source based on known patterns
    const isHls = /m3u8|stream|vidstream|gogoplay|rapidcdn/i.test(fullUrl);
    const isMp4 = /\.mp4|mp4upload|filemoon/i.test(fullUrl);

    let type: UnifiedStreamSource["type"] = "iframe";
    let quality: string | undefined;

    if (isHls) {
      type = "iframe"; // Embeds that contain HLS
      quality = "HLS";
    }
    if (isMp4) {
      type = "iframe";
      quality = "MP4";
    }

    // Try to extract server name from nearby HTML
    if (/streamtape/i.test(fullUrl)) quality = "StreamTape";
    if (/vidstream|gogoplay/i.test(fullUrl)) quality = "VidStreaming";
    if (/filemoon/i.test(fullUrl)) quality = "FileMoon";
    if (/mp4upload/i.test(fullUrl)) quality = "MP4Upload";
    if (/mixdrop/i.test(fullUrl)) quality = "MixDrop";
    if (/doodstream/i.test(fullUrl)) quality = "DoodStream";

    // Route HLS through our proxy
    const url = isHls && fullUrl.includes(".m3u8")
      ? `/api/proxy/m3u8?url=${encodeURIComponent(fullUrl)}&referer=${encodeURIComponent(AD_BASE + "/")}`
      : fullUrl;

    sources.push({
      url,
      type,
      quality,
      originalUrl: fullUrl,
      upstreamReferer: AD_BASE + "/",
    });
  }

  // Also look for direct video URLs in the HTML
  const videoRe = /(?:src|source|url)["']?\s*[:=]\s*["']([^"']*(?:\.m3u8|\.mp4)[^"']*)/gi;
  let vMatch;
  while ((vMatch = videoRe.exec(html)) !== null) {
    const vUrl = vMatch[1];
    if (!vUrl.startsWith("http")) continue;
    // Avoid duplicates
    if (sources.some(s => s.originalUrl === vUrl)) continue;

    const isHls = vUrl.includes(".m3u8");
    sources.push({
      url: isHls
        ? `/api/proxy/m3u8?url=${encodeURIComponent(vUrl)}&referer=${encodeURIComponent(AD_BASE + "/")}`
        : vUrl,
      type: isHls ? "master" : "mp4",
      quality: isHls ? "Auto" : "MP4",
      originalUrl: vUrl,
      upstreamReferer: AD_BASE + "/",
    });
  }

  return {
    sources,
    subtitles: [],
    server: sources.length > 0 ? "multi" : "unknown",
    provider: "animedunya",
  };
}

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
 * Parse an animedunya ID. Supports:
 *   - Slug: "solo-leveling-season-2"
 *   - Prefixed: "animedunya:solo-leveling-season-2"
 *   - AniList universal: "al:154587"
 */
function parseAnimedunyaId(id: string): string | null {
  if (id.startsWith("animedunya:")) return id.slice(12);
  if (id.startsWith("al:")) return null; // Needs resolution
  return id;
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                            */
/* ------------------------------------------------------------------ */

export const animedunyaProvider: Provider = {
  meta: {
    id: "animedunya",
    label: "AnimeDunya",
    description: "Multi-server · Sub · English + Farsi · Cloudflare-protected",
    accent: "from-emerald-500 to-teal-600",
    supportsDub: false,
    defaultServer: "default",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];

    // Try fetching search page via curl
    const html = curlGet(`${AD_BASE}/en/animelist?q=${encodeURIComponent(query)}`);

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
    const slug = parseAnimedunyaId(id);

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

    // Direct slug — fetch from anime-dunya
    const html = curlGet(`${AD_BASE}/en/anime/${encodeURIComponent(slug)}`);
    if (!html || html.includes("Cloudflare")) return null;

    // Parse title
    const titleMatch = html.match(/<title[^>]*>([^<]+)/);
    const rawTitle = titleMatch ? decodeHTMLEntities(titleMatch[1].replace(/\s*[|\-–].*$/, "").trim()) : slug;

    // Parse cover image
    const coverMatch = html.match(/<img[^>]*class="[^"]*cover[^"]*"[^>]*src="([^"]+)"/i)
      || html.match(/<img[^>]*src="([^"]+)"[^>]*class="[^"]*cover[^"]*"/i)
      || html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    const cover = coverMatch ? coverMatch[1] : undefined;

    // Parse description
    const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i)
      || html.match(/<div[^>]*class="[^"]*(?:synopsis|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const description = descMatch ? decodeHTMLEntities(descMatch[1].replace(/<[^>]+>/g, "").trim()) : undefined;

    return {
      id: slug,
      title: { english: rawTitle, preferred: rawTitle },
      coverImage: cover ? { large: cover } : undefined,
      description,
    };
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const slug = parseAnimedunyaId(id);

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

    const html = curlGet(`${AD_BASE}/en/anime/${encodeURIComponent(slug)}`);
    if (!html || html.includes("Cloudflare")) return [];

    const episodes = parseEpisodes(html, slug);
    return cacheSet(cacheKey, episodes);
  },

  async getServers(id: string, epNum: number): Promise<UnifiedServer[]> {
    // Anime-Dunya typically provides multiple embed servers
    return [
      { id: "default", label: "Default", default: true },
      { id: "vidstreaming", label: "VidStreaming" },
      { id: "streamtape", label: "StreamTape" },
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
    const slug = parseAnimedunyaId(id);

    if (!slug) {
      return { sources: [], subtitles: [], server: server || "default", provider: "animedunya" };
    }

    // Fetch episode watch page
    const watchSlug = `${slug}-episode-${epNum}`;
    const cacheKey = `sources:${watchSlug}`;
    const cached = cacheGet<UnifiedSources>(cacheKey);
    if (cached) return cached;

    const html = curlGet(`${AD_BASE}/en/watch/${encodeURIComponent(watchSlug)}`);
    if (!html || html.includes("Cloudflare")) {
      return { sources: [], subtitles: [], server: server || "default", provider: "animedunya" };
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
