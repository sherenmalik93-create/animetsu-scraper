/**
 * Streaming CORS proxy for upstream m3u8 / segment / subtitle URLs.
 *
 * Design goals:
 *   1. STREAM, don't buffer. We pipe upstream bytes through a ReadableStream
 *      so we never hold a full segment in memory and we bypass the Vercel
 *      Hobby 4.5MB response body limit.
 *   2. Forward Range headers both ways so MP4 byte-range requests work.
 *   3. Handle CORS preflight (OPTIONS) so the browser actually lets the
 *      player fetch from us.
 *   4. Auto-pick the right Referer per upstream host (animetsu.live,
 *      miruro.to, anikuro.ru, animeyubi.com, swiftstream.top, etc.) so
 *      Cloudflare/CDN challenges don't 403 us.
 *   5. Rewrite every URI inside m3u8 playlists (variants, segments,
 *      EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA, EXT-X-SESSION-DATA) so the
 *      player keeps calling us instead of going direct.
 *
 * Usage:
 *   GET /api/proxy/m3u8?url=<encoded>
 *   GET /api/proxy/m3u8?url=<encoded>&referer=<encoded>      # override referer
 *   GET /api/proxy/m3u8?url=<encoded>&format=vtt             # force VTT subtitle
 *   GET /api/proxy/m3u8?url=<encoded>&format=m3u8            # force m3u8 playlist
 *   OPTIONS /api/proxy/m3u8                                   # CORS preflight
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Per-host Referer table. When the upstream URL's host matches one of these,
 * we send that host's page as the Referer. This is what the upstream CDN
 * expects (it usually 403s requests without the right Referer).
 */
const REFERER_BY_HOST: Array<{ match: RegExp; referer: string }> = [
  { match: /animetsu\.live$/i, referer: "https://animetsu.live/" },
  { match: /miruro\.to$/i, referer: "https://www.miruro.to/" },
  { match: /anikuro\.ru$/i, referer: "https://anikuro.ru/" },
  { match: /animeyubi\.com$/i, referer: "https://animeyubi.com/" },
  { match: /swiftstream\.top$/i, referer: "https://animetsu.live/" },
  { match: /megacloud\.club$/i, referer: "https://animetsu.live/" },
  { match: /rapid\-?cdn/i, referer: "https://animetsu.live/" },
  { match: /kwik\.(sx|si|fi)$/i, referer: "https://animeyubi.com/" },
];

const DEFAULT_REFERERS = ["https://animetsu.live/", "https://www.miruro.to/"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers":
    "Content-Type, Content-Length, Content-Range, Accept-Ranges",
  "Access-Control-Max-Age": "86400",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickReferer(targetUrl: string, override?: string | null): string {
  if (override) return override;
  let host = "";
  try {
    host = new URL(targetUrl).hostname;
  } catch {
    /* ignore */
  }
  for (const r of REFERER_BY_HOST) {
    if (r.match.test(host)) return r.referer;
  }
  // Fall back to the upstream origin itself — better than nothing.
  try {
    const u = new URL(targetUrl);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return DEFAULT_REFERERS[0];
  }
}

function buildUpstreamHeaders(target: string, referer: string, req: NextRequest) {
  const headers: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    Referer: referer,
    Origin: referer.replace(/\/$/, ""),
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
  };
  // Forward Range header so MP4 byte-range requests work
  const range = req.headers.get("range");
  if (range) headers["Range"] = range;
  return headers;
}

/**
 * Rewrite every URI inside an m3u8 playlist so it goes back through this
 * proxy. Handles:
 *   - Plain URI lines (variants, segments)
 *   - #EXT-X-KEY URI="..."
 *   - #EXT-X-MAP URI="..."
 *   - #EXT-X-MEDIA URI="..."
 *   - #EXT-X-SESSION-DATA URI="..."
 */
function rewritePlaylistUrls(
  body: string,
  baseUrl: string,
  referer?: string
): string {
  const proxy = "/api/proxy/m3u8?url=";
  const refererSuffix = referer
    ? `&referer=${encodeURIComponent(referer)}`
    : "";
  const lines = body.split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        // Rewrite URI="..." attributes inside #EXT-X-* tags
        return line.replace(/URI="([^"]+)"/g, (_m, rawUri: string) => {
          let absolute: string;
          if (/^https?:\/\//i.test(rawUri)) {
            absolute = rawUri;
          } else {
            try {
              absolute = new URL(rawUri, baseUrl).href;
            } catch {
              return _m;
            }
          }
          return `URI="${proxy}${encodeURIComponent(absolute)}${refererSuffix}"`;
        });
      }
      // Plain URI line
      let absolute: string;
      if (/^https?:\/\//i.test(trimmed)) {
        absolute = trimmed;
      } else {
        try {
          absolute = new URL(trimmed, baseUrl).href;
        } catch {
          return line;
        }
      }
      return `${proxy}${encodeURIComponent(absolute)}${refererSuffix}`;
    })
    .join("\n");
}

/** Convert a web ReadableStream<Uint8Array> into a Node Buffer-friendly stream. */
function pipeThrough(upstreamBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  // Already a web ReadableStream — pass straight through. The Response
  // constructor accepts this directly.
  return upstreamBody;
}

// ---------------------------------------------------------------------------
// OPTIONS — CORS preflight
// ---------------------------------------------------------------------------

export async function OPTIONS(_req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Content-Length": "0" },
  });
}

// ---------------------------------------------------------------------------
// HEAD — same as GET but no body
// ---------------------------------------------------------------------------

export async function HEAD(req: NextRequest) {
  return GET(req);
}

// ---------------------------------------------------------------------------
// GET — main proxy
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  const format = req.nextUrl.searchParams.get("format"); // "vtt" | "m3u8" | undefined
  const refererOverride = req.nextUrl.searchParams.get("referer");

  if (!urlParam) {
    return NextResponse.json(
      { error: "Missing url parameter." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  let target: string;
  try {
    target = decodeURIComponent(urlParam);
  } catch {
    return NextResponse.json(
      { error: "Invalid url encoding." },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (!/^https?:\/\//i.test(target)) {
    return NextResponse.json(
      { error: "url must be absolute http(s)." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const referer = pickReferer(target, refererOverride);
  const upstreamHeaders = buildUpstreamHeaders(target, referer, req);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "follow",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to reach upstream.",
      },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  // Pass upstream error through with our CORS headers attached.
  if (!upstream.ok && upstream.status !== 206) {
    // Partial content (206) is success for range requests.
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        "Content-Type":
          upstream.headers.get("content-type") || "text/plain",
      },
    });
  }

  const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
  const lowerTarget = target.toLowerCase();
  const isPlaylistForced = format === "m3u8";
  const isSubtitleForced = format === "vtt";

  // --- m3u8 PLAYLIST branch ---
  // Detect playlist either by forced format, content-type, URL suffix, or
  // peeking at the body's first few bytes.
  const looksLikePlaylistByMeta =
    isPlaylistForced ||
    contentType.includes("mpegurl") ||
    contentType.includes("m3u8") ||
    lowerTarget.endsWith(".m3u8") ||
    lowerTarget.includes(".m3u8?");

  if (looksLikePlaylistByMeta) {
    const body = await upstream.text();
    // Defend against false positives — if it doesn't start with #EXTM3U,
    // treat it as a binary passthrough.
    if (body.trimStart().startsWith("#EXTM3U")) {
      const rewritten = rewritePlaylistUrls(body, target, referer);
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "public, max-age=10, s-maxage=30",
        },
      });
    }
    // False positive — fall through to binary branch below using a fresh
    // Response built from the text we already consumed.
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    });
  }

  // --- VTT SUBTITLE branch ---
  if (
    isSubtitleForced ||
    contentType.includes("text/vtt") ||
    lowerTarget.endsWith(".vtt")
  ) {
    const body = await upstream.text();
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    });
  }

  // --- Binary segment / MP4 / TS branch — STREAM IT THROUGH ---
  // This is the key change: we do NOT buffer the whole segment into memory.
  // We pipe the upstream ReadableStream straight into the NextResponse body,
  // which means:
  //   - Memory usage stays flat regardless of segment size
  //   - Vercel Hobby's 4.5MB response body limit is bypassed (streaming)
  //   - First byte to the player is immediate
  const passthroughHeaders: Record<string, string> = {
    ...CORS_HEADERS,
    "Content-Type":
      upstream.headers.get("content-type") || "application/octet-stream",
    "Cache-Control": "public, max-age=300, s-maxage=3600",
  };

  // Forward Content-Length, Content-Range, Accept-Ranges so the player
  // can do its own range logic.
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) passthroughHeaders["Content-Length"] = contentLength;
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) passthroughHeaders["Content-Range"] = contentRange;
  passthroughHeaders["Accept-Ranges"] =
    upstream.headers.get("accept-ranges") || "bytes";

  const status = upstream.status === 206 ? 206 : 200;

  return new NextResponse(pipeThrough(upstream.body as ReadableStream<Uint8Array>), {
    status,
    headers: passthroughHeaders,
  });
}
