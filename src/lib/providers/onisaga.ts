/**
 * OniSaga provider — wraps https://onisaga.com/
 *
 * OniSaga is a massive manga/manhwa/manhua reading site built on a custom
 * Laravel + Livewire + Alpine.js + Flux UI stack (NOT WordPress/Madara).
 *
 * URL patterns:
 *   /                            — landing page (hero with stats)
 *   /home                        — home with featured, popular, latest sections
 *   /browse                      — browse catalog (supports ?status=ongoing&type=MANGA&sort=latest&page=N)
 *   /search/{query}              — search results page
 *   /manga/{slug}                — manga detail page (JSON-LD + chapter list)
 *   /read/{slug}/{chapterId}     — chapter reader page (Alpine.js mangaReader component)
 *   /api/chapter/{id}/page/{n}   — signed image API (requires X-Reader-Token)
 *
 * Key technical challenges:
 *   1. Cloudflare Turnstile on browser requests — but curl bypasses easily
 *   2. Signed, rotating reader tokens (HMAC + timestamp, per-session)
 *   3. Token rotation: X-Reader-Token-Next header provides next token
 *   4. Rate limiting: 300 requests/window
 *   5. No public REST API — all data is either JSON-LD or Livewire-rendered HTML
 *   6. Images served as signed CDN blobs (not direct URLs)
 *
 * Strategy:
 *   - All HTTP requests via curl (CF bypass)
 *   - Parse JSON-LD <script type="application/ld+json"> for manga metadata
 *   - Extract chapter list from manga detail page HTML (links to /read/{slug}/{id})
 *   - Extract Alpine.js mangaReader component data for readerToken + chaptersMap + pages
 *   - Call /api/chapter/{id}/page/{n} with X-Reader-Token for each page image
 *   - Handle token rotation via X-Reader-Token-Next
 *   - Proxy images through /api/proxy/image for CORS
 *   - In-process LRU cache (5-min TTL, 500 entry cap)
 *
 * ID format: slug-based, e.g. "isekai-anime-studio"
 * Also supports "onisaga:slug" and AniList universal "al:{id}"
 */

import type {
  Provider,
  UnifiedSearchResult,
  UnifiedEpisode,
  UnifiedServer,
  UnifiedSources,
  UnifiedStreamSource,
} from "./types";
import { searchAniList, getAniListMedia, getAniListManga } from "@/lib/anilist/client";
import { execSync } from "node:child_process";

const OS_BASE = "https://onisaga.com";

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
      `-H "Referer: ${OS_BASE}/" ` +
      `--compressed ` +
      `"${url}"`,
      { encoding: "utf-8", timeout: 20000, maxBuffer: 5 * 1024 * 1024 }
    );
    return result || null;
  } catch (err) {
    console.error(`[onisaga] curl failed for ${url}:`, (err as Error).message);
    return null;
  }
}

/**
 * curl-based API call with custom headers (for signed image API).
 * Returns { body, headers } where headers includes X-Reader-Token-Next.
 */
function curlApi(
  url: string,
  headers: Record<string, string> = {}
): { body: string; headers: Record<string, string> } | null {
  const headerArgs = Object.entries(headers)
    .map(([k, v]) => `-H "${k}: ${v}"`)
    .join(" ");
  try {
    // Use -D - to dump response headers before body
    const result = execSync(
      `curl -sS --max-time 15 ` +
      `-H "User-Agent: ${BROWSER_UA}" ` +
      `-H "Accept: application/json, */*" ` +
      `-H "Accept-Language: en-US,en;q=0.9" ` +
      `-H "Referer: ${OS_BASE}/" ` +
      headerArgs + " " +
      `-D - ` +
      `"${url}"`,
      { encoding: "utf-8", timeout: 20000, maxBuffer: 5 * 1024 * 1024 }
    );
    if (!result) return null;

    // Split headers from body at first \r\n\r\n
    const headerEnd = result.indexOf("\r\n\r\n");
    if (headerEnd === -1) return { body: result, headers: {} };

    const headerBlock = result.slice(0, headerEnd);
    const body = result.slice(headerEnd + 4);

    const respHeaders: Record<string, string> = {};
    for (const line of headerBlock.split("\r\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const key = line.slice(0, idx).trim().toLowerCase();
        const val = line.slice(idx + 1).trim();
        respHeaders[key] = val;
      }
    }

    return { body, headers: respHeaders };
  } catch (err) {
    console.error(`[onisaga] curlApi failed for ${url}:`, (err as Error).message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  HTML / JSON parsing helpers                                        */
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

/** Extract JSON-LD structured data from a page. */
function extractJsonLd(html: string): Record<string, any>[] {
  const results: Record<string, any>[] = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      results.push(JSON.parse(m[1]));
    } catch {
      // skip malformed JSON-LD
    }
  }
  return results;
}

/** Extract the CSRF token from a page. */
function extractCsrf(html: string): string | null {
  const m = html.match(/name="csrf-token"\s+content="([^"]+)"/i);
  return m ? m[1] : null;
}

/** Extract manga cards from search/browse page HTML. */
function parseMangaCards(html: string): Array<{
  slug: string;
  title: string;
  cover?: string;
  url: string;
}> {
  const results: Array<{ slug: string; title: string; cover?: string; url: string }> = [];

  // OniSaga uses <a href="/manga/{slug}"> patterns
  // Split on manga links to isolate each card
  const blocks = html.split(/href="\/manga\/([^"]+)"/);

  // blocks[0] is before first match, then alternating: slug, rest-of-html
  for (let i = 1; i < blocks.length; i += 2) {
    const slug = blocks[i];
    const rest = blocks[i + 1] || "";

    if (!slug || slug.length < 2) continue;

    // Extract title from nearby text
    const titleMatch = rest.match(/>([^<]{2,200})</);
    const title = titleMatch
      ? decodeHTMLEntities(titleMatch[1].trim())
      : slug.replace(/-/g, " ");

    // Extract cover image — OniSaga uses uploads/poster/ paths
    const imgMatch = rest.match(/src="([^"]*uploads\/poster[^"]*)"/i)
      || rest.match(/src="([^"]*(?:cover|poster|image)[^"]*\.(?:jpg|jpeg|png|webp|avif))"/i)
      || rest.match(/src="([^"]+)"[^>]*(?:alt|loading)/i);
    const cover = imgMatch ? imgMatch[1] : undefined;

    // Deduplicate
    if (results.some(r => r.slug === slug)) continue;

    results.push({
      slug,
      title,
      cover: cover && !cover.startsWith("data:") ? (cover.startsWith("http") ? cover : `${OS_BASE}${cover}`) : undefined,
      url: `/manga/${slug}`,
    });
  }

  return results;
}

/** Parse manga metadata from the detail page. */
interface MangaDetail {
  slug: string;
  title: string;
  cover?: string;
  description?: string;
  author?: string;
  status?: string;
  rating?: number;
  ratingCount?: number;
  datePublished?: string;
  genres?: string[];
  type?: string; // MANGA, MANHWA, MANHUA, NOVEL
}

function parseMangaDetail(html: string, slug: string): MangaDetail | null {
  const detail: MangaDetail = { slug, title: slug.replace(/-/g, " ") };

  // 1. Parse JSON-LD for structured data
  const jsonLd = extractJsonLd(html);
  const bookLd = jsonLd.find(
    (ld) => ld["@type"] === "Book" || ld["@type"] === "Product"
  );

  if (bookLd) {
    detail.title = bookLd.name || detail.title;
    detail.description = bookLd.description || undefined;
    detail.datePublished = bookLd.datePublished || undefined;
    detail.cover = bookLd.image || undefined;

    if (bookLd.author) {
      const authors = Array.isArray(bookLd.author) ? bookLd.author : [bookLd.author];
      detail.author = authors
        .map((a: any) => (typeof a === "string" ? a : a.name || ""))
        .filter(Boolean)
        .join(", ") || undefined;
    }

    if (bookLd.aggregateRating) {
      detail.rating = parseFloat(bookLd.aggregateRating.ratingValue) || undefined;
      detail.ratingCount = parseInt(bookLd.aggregateRating.ratingCount) || undefined;
    }
  }

  // 2. Fallback: parse <title> tag
  if (detail.title === slug.replace(/-/g, " ")) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)/);
    if (titleMatch) {
      detail.title = decodeHTMLEntities(
        titleMatch[1].replace(/\s*[|\-–].*$/, "").trim()
      );
    }
  }

  // 3. Fallback: parse og:image for cover
  if (!detail.cover) {
    const coverMatch = html.match(
      /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i
    );
    if (coverMatch) detail.cover = coverMatch[1];
  }

  // 4. Fallback: parse og:description
  if (!detail.description) {
    const descMatch = html.match(
      /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i
    );
    if (descMatch) {
      detail.description = decodeHTMLEntities(descMatch[1].trim());
    }
  }

  // 5. Parse genres from links
  const genreLinks = html.match(/href="\/genre\/([^"]+)"/gi) || [];
  detail.genres = genreLinks
    .map((g) => {
      const m = g.match(/\/genre\/([^"]+)/);
      return m ? m[1].replace(/-/g, " ") : null;
    })
    .filter(Boolean) as string[];

  // 6. Parse status (Ongoing / Completed / Hiatus / Releasing)
  const statusMatch = html.match(
    /\b(Ongoing|Completed|Hiatus|Releasing|Cancelled)\b/i
  );
  if (statusMatch) detail.status = statusMatch[1];

  // 7. Parse type (MANGA / MANHWA / MANHUA / NOVEL)
  const typeMatch = html.match(
    /\b(MANGA|MANHWA|MANHUA|NOVEL)\b/i
  );
  if (typeMatch) detail.type = typeMatch[1].toUpperCase();

  return detail;
}

/** Parse chapter list from manga detail page HTML. */
interface ChapterEntry {
  number: number;
  displayNumber: string;
  chapterId: string;
  url: string;
}

function parseChapters(html: string, slug: string): ChapterEntry[] {
  const chapters: ChapterEntry[] = [];
  const seen = new Set<string>();

  // OniSaga chapter links: /read/{slug}/{numericChapterId}
  const chapterRe = new RegExp(
    `href="(${OS_BASE})?/read/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\d+)"`,
    "gi"
  );
  let m;
  while ((m = chapterRe.exec(html)) !== null) {
    const chapterId = m[2];
    if (seen.has(chapterId)) continue;
    seen.add(chapterId);

    // Try to find the chapter number near the link
    const afterLink = html.slice(m.index, m.index + 300);
    const numMatch = afterLink.match(
      /(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i
    ) || afterLink.match(/(\d+(?:\.\d+)?)/);

    const displayNumber = numMatch ? numMatch[1] : String(chapters.length + 1);
    const number = parseFloat(displayNumber);

    chapters.push({
      number: isNaN(number) ? chapters.length + 1 : number,
      displayNumber,
      chapterId,
      url: `${OS_BASE}/read/${slug}/${chapterId}`,
    });
  }

  // Also try generic /read/{slug}/{id} pattern in case slug varies
  if (chapters.length === 0) {
    const genericRe = /href="\/read\/([^/]+)\/(\d+)"/gi;
    while ((m = genericRe.exec(html)) !== null) {
      const chapterSlug = m[1];
      const chapterId = m[2];
      if (chapterSlug !== slug) continue;
      if (seen.has(chapterId)) continue;
      seen.add(chapterId);

      const afterLink = html.slice(m.index, m.index + 300);
      const numMatch = afterLink.match(/(\d+(?:\.\d+)?)/);
      const displayNumber = numMatch ? numMatch[1] : String(chapters.length + 1);

      chapters.push({
        number: parseFloat(displayNumber) || chapters.length + 1,
        displayNumber,
        chapterId,
        url: `${OS_BASE}/read/${chapterSlug}/${chapterId}`,
      });
    }
  }

  // Sort by number ascending
  chapters.sort((a, b) => a.number - b.number);

  return chapters;
}

/** Parse the Alpine.js mangaReader component from a chapter read page. */
interface ReaderData {
  pages: Array<{ order: number; width?: number; height?: number }>;
  totalPages: number;
  mangaId: number;
  chapterId: number;
  readerToken: string;
  chaptersMap: Array<{ chapter: string; url: string }>;
  totalChapters: number;
  chapterPosition: number;
  nextChapterUrl?: string;
  prevChapterUrl?: string;
}

function parseReaderData(html: string): ReaderData | null {
  // Extract the mangaReader Alpine.data() definition
  // Pattern: Alpine.data('mangaReader', () => ({ ... }))
  const readerMatch = html.match(
    /Alpine\.data\s*\(\s*['"]mangaReader['"]\s*,\s*\(\)\s*=>\s*(\(\s*\{[\s\S]*?\}\s*\))\s*\)/
  );
  if (!readerMatch) {
    // Fallback: look for readerToken in any Alpine.data
    const tokenMatch = html.match(/readerToken:\s*"([^"]+)"/);
    if (!tokenMatch) return null;

    // Try to extract what we can
    const pagesMatch = html.match(/pages:\s*(\[[\s\S]*?\])/);
    const chaptersMapMatch = html.match(/chaptersMap:\s*(\[[\s\S]*?\])/);
    const totalChaptersMatch = html.match(/totalChapters:\s*(\d+)/);
    const chapterPositionMatch = html.match(/chapterPosition:\s*(\d+)/);
    const chapterIdMatch = html.match(/chapterId:\s*(\d+)/);
    const mangaIdMatch = html.match(/mangaId:\s*(\d+)/);
    const totalPagesMatch = html.match(/totalPages:\s*(\d+)/);

    let pages: Array<{ order: number; width?: number; height?: number }> = [];
    if (pagesMatch) {
      try {
        pages = JSON.parse(pagesMatch[1]);
      } catch {}
    }

    let chaptersMap: Array<{ chapter: string; url: string }> = [];
    if (chaptersMapMatch) {
      try {
        chaptersMap = JSON.parse(chaptersMapMatch[1]);
      } catch {}
    }

    return {
      pages,
      totalPages: totalPagesMatch ? parseInt(totalPagesMatch[1]) : pages.length,
      mangaId: mangaIdMatch ? parseInt(mangaIdMatch[1]) : 0,
      chapterId: chapterIdMatch ? parseInt(chapterIdMatch[1]) : 0,
      readerToken: tokenMatch[1],
      chaptersMap,
      totalChapters: totalChaptersMatch ? parseInt(totalChaptersMatch[1]) : 0,
      chapterPosition: chapterPositionMatch ? parseInt(chapterPositionMatch[1]) : 0,
    };
  }

  // Try to evaluate the component data safely
  // The pattern is: () => ({ key: value, ... })
  // We'll extract individual fields with regex as a safer approach
  const data = readerMatch[1];

  const extractString = (key: string): string | undefined => {
    const m = data.match(new RegExp(`${key}:\\s*"([^"]+)"`));
    return m ? m[1] : undefined;
  };
  const extractNumber = (key: string): number => {
    const m = data.match(new RegExp(`${key}:\\s*(\\d+)`));
    return m ? parseInt(m[1]) : 0;
  };
  const extractArray = <T>(key: string): T[] => {
    const m = data.match(new RegExp(`${key}:\\s*(\\[[\\s\\S]*?\\])`));
    if (!m) return [];
    try {
      return JSON.parse(m[1]);
    } catch {
      return [];
    }
  };

  return {
    pages: extractArray<{ order: number; width?: number; height?: number }>("pages"),
    totalPages: extractNumber("totalPages"),
    mangaId: extractNumber("mangaId"),
    chapterId: extractNumber("chapterId"),
    readerToken: extractString("readerToken") || "",
    chaptersMap: extractArray<{ chapter: string; url: string }>("chaptersMap"),
    totalChapters: extractNumber("totalChapters"),
    chapterPosition: extractNumber("chapterPosition"),
    nextChapterUrl: extractString("nextChapterUrl"),
    prevChapterUrl: extractString("prevChapterUrl"),
  };
}

/**
 * Fetch a page image URL using the signed API.
 * Handles token rotation via X-Reader-Token-Next.
 */
function fetchPageImageUrl(
  chapterId: number,
  pageOrder: number,
  token: string
): { url: string; nextToken?: string } | null {
  const apiUrl = `${OS_BASE}/api/chapter/${chapterId}/page/${pageOrder}`;
  const result = curlApi(apiUrl, {
    "X-Reader-Token": token,
    "Accept": "application/json",
  });

  if (!result) return null;

  try {
    const data = JSON.parse(result.body);
    if (data.error) {
      console.error(`[onisaga] API error: ${data.error}`);
      return null;
    }
    if (!data.url) {
      console.error(`[onisaga] No URL in API response for page ${pageOrder}`);
      return null;
    }

    return {
      url: data.url,
      nextToken: result.headers["x-reader-token-next"] || undefined,
    };
  } catch (err) {
    console.error(`[onisaga] Failed to parse page API response:`, err);
    return null;
  }
}

/**
 * Fetch ALL page image URLs for a chapter, handling token rotation.
 * Returns an array of signed CDN URLs.
 */
function fetchAllPageImages(
  chapterId: number,
  totalPages: number,
  initialToken: string
): string[] {
  const urls: string[] = [];
  let token = initialToken;

  for (let i = 0; i < totalPages; i++) {
    const result = fetchPageImageUrl(chapterId, i, token);
    if (!result) {
      console.error(`[onisaga] Failed to fetch page ${i}/${totalPages}`);
      urls.push(""); // placeholder for failed page
      continue;
    }

    urls.push(result.url);
    if (result.nextToken) {
      token = result.nextToken;
    }
  }

  return urls.filter(Boolean);
}

/* ------------------------------------------------------------------ */
/*  In-process cache                                                   */
/* ------------------------------------------------------------------ */

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
    const k = cache.keys().next().value;
    if (k) cache.delete(k);
  }
  return v;
}

/* ------------------------------------------------------------------ */
/*  ID parsing                                                         */
/* ------------------------------------------------------------------ */

/**
 * Parse an onisaga ID. Supports:
 *   - Slug: "isekai-anime-studio"
 *   - Prefixed: "onisaga:isekai-anime-studio"
 *   - AniList universal: "al:12345"
 */
function parseOnisagaId(id: string): string | null {
  if (id.startsWith("onisaga:")) return id.slice(8);
  if (id.startsWith("al:")) return null; // Needs resolution
  return id;
}

/* ------------------------------------------------------------------ */
/*  Provider implementation                                            */
/* ------------------------------------------------------------------ */

export const onisagaProvider: Provider = {
  meta: {
    id: "onisaga",
    label: "OniSaga",
    description: "Manga · Manhwa · Manhua · 75K+ titles · Cloudflare-protected · Signed API",
    accent: "from-red-600 to-orange-500",
    supportsDub: false,
    defaultServer: "default",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];

    // Try OniSaga search page via curl
    const html = curlGet(`${OS_BASE}/search/${encodeURIComponent(query)}`);

    if (html && !html.includes("Just a moment") && html.length > 1000) {
      const cards = parseMangaCards(html);
      if (cards.length > 0) {
        return cards.map((c) => ({
          id: c.slug,
          title: { english: c.title, preferred: c.title },
          coverImage: c.cover ? { large: c.cover } : undefined,
          format: "MANGA",
        }));
      }
    }

    // Fallback: try browse page with search
    const browseHtml = curlGet(
      `${OS_BASE}/browse?search=${encodeURIComponent(query)}`
    );
    if (browseHtml && !browseHtml.includes("Just a moment") && browseHtml.length > 1000) {
      const cards = parseMangaCards(browseHtml);
      if (cards.length > 0) {
        return cards.map((c) => ({
          id: c.slug,
          title: { english: c.title, preferred: c.title },
          coverImage: c.cover ? { large: c.cover } : undefined,
          format: "MANGA",
        }));
      }
    }

    // Final fallback to AniList (manga search)
    const alResults = await searchAniList(query, "MANGA");
    return alResults.map((r: any) => ({
      id: `al:${r.id}`,
      anilistId: r.id,
      title: {
        romaji: r.title?.romaji,
        english: r.title?.english,
        native: r.title?.native,
      },
      coverImage: { large: r.coverImage?.large },
      description: r.description,
      status: r.status,
      year: r.seasonYear,
      format: r.format,
      genres: r.genres,
      averageScore: r.averageScore,
      totalEpisodes: r.chapters,
    }));
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    const slug = parseOnisagaId(id);

    if (!slug) {
      // AniList ID — use AniList MANGA for metadata
      const alId = id.startsWith("al:") ? parseInt(id.slice(3)) : null;
      if (!alId) return null;

      const alData = await getAniListManga(alId);
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
        totalEpisodes: alData.chapters,
      };
    }

    // Direct slug — fetch from OniSaga
    const html = curlGet(`${OS_BASE}/manga/${encodeURIComponent(slug)}`);
    if (!html || html.includes("Just a moment")) return null;

    const detail = parseMangaDetail(html, slug);
    if (!detail) return null;

    return {
      id: slug,
      title: { english: detail.title, preferred: detail.title },
      coverImage: detail.cover ? { large: detail.cover } : undefined,
      description: detail.description,
      status: detail.status,
      year: detail.datePublished ? new Date(detail.datePublished).getFullYear() : undefined,
      format: detail.type || "MANGA",
      genres: detail.genres,
      averageScore: detail.rating ? Math.round(detail.rating * 10) : undefined, // Convert 10-point to 100-point scale
    };
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const slug = parseOnisagaId(id);

    if (!slug) {
      // For AniList IDs, generate synthetic chapter list
      const alId = id.startsWith("al:") ? parseInt(id.slice(3)) : null;
      if (!alId) return [];
      const alData = await getAniListManga(alId);
      const total = alData?.chapters || 50;

      return Array.from({ length: Math.min(total, 500) }, (_, i) => ({
        number: i + 1,
        displayNumber: String(i + 1),
        sourceId: `${id}:ch${i + 1}`,
        variants: ["sub"],
        title: `Chapter ${i + 1}`,
      }));
    }

    // Fetch manga detail page for chapter list
    const cacheKey = `episodes:${slug}`;
    const cached = cacheGet<UnifiedEpisode[]>(cacheKey);
    if (cached) return cached;

    const html = curlGet(`${OS_BASE}/manga/${encodeURIComponent(slug)}`);
    if (!html || html.includes("Just a moment")) return [];

    const chapters = parseChapters(html, slug);

    const episodes: UnifiedEpisode[] = chapters.map((ch) => ({
      number: ch.number,
      displayNumber: ch.displayNumber,
      sourceId: `${slug}:${ch.chapterId}`,
      variants: ["sub"],
      title: `Chapter ${ch.displayNumber}`,
    }));

    return cacheSet(cacheKey, episodes);
  },

  async getServers(id: string, epNum: number): Promise<UnifiedServer[]> {
    // OniSaga is manga — single "server" (direct pages)
    return [{ id: "default", label: "Pages", default: true }];
  },

  async getSources(opts: {
    id: string;
    epNum: number;
    server?: string;
    sourceType?: "sub" | "dub";
  }): Promise<UnifiedSources> {
    const { id, epNum, server, sourceType = "sub" } = opts;
    const slug = parseOnisagaId(id);

    if (!slug) {
      return {
        sources: [],
        subtitles: [],
        server: server || "default",
        provider: "onisaga",
      };
    }

    // First, get the chapter list to find the chapterId for this episode
    const episodesKey = `episodes:${slug}`;
    let episodes = cacheGet<UnifiedEpisode[]>(episodesKey);

    if (!episodes) {
      // Fetch episodes first
      episodes = await this.getEpisodes(id);
    }

    const targetEpisode = episodes.find(
      (ep) => ep.number === epNum || ep.sourceId === `${slug}:${epNum}`
    );

    if (!targetEpisode) {
      return {
        sources: [],
        subtitles: [],
        server: server || "default",
        provider: "onisaga",
      };
    }

    // Parse the sourceId to get the chapterId
    // sourceId format: "{slug}:{chapterId}"
    const parts = targetEpisode.sourceId.split(":");
    const chapterId = parts.length > 1 ? parts[parts.length - 1] : String(epNum);

    // Fetch the reader page to get readerToken + page count
    const cacheKey = `reader:${slug}:${chapterId}`;
    const cached = cacheGet<UnifiedSources>(cacheKey);
    if (cached) return cached;

    const readUrl = `${OS_BASE}/read/${encodeURIComponent(slug)}/${chapterId}`;
    const html = curlGet(readUrl);

    if (!html || html.includes("Just a moment")) {
      return {
        sources: [],
        subtitles: [],
        server: server || "default",
        provider: "onisaga",
      };
    }

    const readerData = parseReaderData(html);

    if (!readerData || !readerData.readerToken) {
      // Fallback: try to construct page URLs without token (may fail)
      console.error(`[onisaga] No readerToken found for chapter ${chapterId}`);
      return {
        sources: [],
        subtitles: [],
        server: server || "default",
        provider: "onisaga",
      };
    }

    // Fetch all page image URLs using the signed API with token rotation
    const pageImages = fetchAllPageImages(
      readerData.chapterId || parseInt(chapterId),
      readerData.totalPages || readerData.pages.length,
      readerData.readerToken
    );

    // Convert page images to source entries
    // Each page is a separate image — we return them as "mp4" type (direct image URL)
    // proxied through our image proxy for CORS
    const sources: UnifiedStreamSource[] = pageImages.map((url, idx) => ({
      url: `/api/proxy/image?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(OS_BASE + "/")}`,
      type: "mp4" as const,
      quality: `Page ${idx + 1}`,
      originalUrl: url,
      upstreamReferer: OS_BASE + "/",
    }));

    const result: UnifiedSources = {
      sources,
      subtitles: [],
      server: server || "default",
      provider: "onisaga",
      raw: {
        chapterId,
        totalPages: readerData.totalPages,
        totalChapters: readerData.totalChapters,
        chapterPosition: readerData.chapterPosition,
        mangaId: readerData.mangaId,
        chaptersMap: readerData.chaptersMap,
      },
    };

    return cacheSet(cacheKey, result);
  },
};
