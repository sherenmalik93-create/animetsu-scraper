import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { getProvider } from "@/lib/providers";
import { resolveIdForProvider } from "@/lib/providers/resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/scrape/anipm-raw?id=<animeId>&ep=<epNum>&type=<sub|dub>
 *
 * DEEP RAW SCRAPE — for every server anipm exposes on this episode, we
 * actually FETCH the upstream URL and return what came back. No "if it
 * plays or not" gating, no iframe-only cop-out — every HLS playlist is
 * pulled and parsed, every MP4 file is HEAD-probed for size + ranges,
 * every iframe URL is recorded as-is.
 *
 * Per user instruction:
 *   "make scrape that scrape all server raw data all server not iframe shit"
 *
 * What this endpoint returns per server:
 *   - HLS (Onyx, MegaPlay, any *.m3u8):
 *       • http_status, content_type
 *       • raw_m3u8 (the FULL playlist text, capped at 64KB so responses stay sane)
 *       • variant_count (number of #EXT-X-STREAM-INF entries)
 *       • segment_count (number of #EXTINF entries — for media playlists)
 *       • first_variant_url, first_segment_url (resolved to absolute)
 *       • is_master (true if it has STREAM-INF, false if it's a media playlist)
 *       • duration_seconds (sum of #EXTINF values, for media playlists)
 *   - MP4 (Vega / kind="file"):
 *       • http_status, content_type, content_length, accept_ranges,
 *         last_modified, etag
 *       • direct_url (the upstream URL — playable in a <video> tag via the proxy)
 *   - iframe (Vidnest, MegaPlay embed, any kind="embed"):
 *       • url, upstream_referer
 *       • (we can't reliably scrape a JS-rendered iframe server-side; the
 *          user's real browser solves any Cloudflare challenge natively)
 *
 * Plus the full upstream /api/anime/src/servers payload (unmodified) and
 * the megaplay extraction diagnostics (variant id chosen, m3u8 url, etc.).
 *
 * The `id` parameter accepts the same formats as /api/scrape/sources:
 *   - "anipm:{seriesId}:{slug}"
 *   - "anipm:{seriesId}"
 *   - "al:{anilistId}" (universal — resolved via title search)
 *
 * Example:
 *   curl ".../api/scrape/anipm-raw?id=al:154587&ep=1"
 *   curl ".../api/scrape/anipm-raw?id=anipm:6351:frieren-beyond-journey-s-end&ep=1&type=dub"
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const ep = Number(req.nextUrl.searchParams.get("ep"));
  const type = (req.nextUrl.searchParams.get("type") || "sub") as "sub" | "dub";
  // server param is passed through but ignored for selection — we probe ALL servers.
  const server = req.nextUrl.searchParams.get("server") || undefined;

  if (!id || !ep) {
    return NextResponse.json(
      {
        error:
          "Missing 'id' or 'ep'. Usage: /api/scrape/anipm-raw?id=al:154587&ep=1",
      },
      { status: 400 }
    );
  }

  try {
    const provider = getProvider("anipm");
    const resolvedId = await resolveIdForProvider("anipm", id);

    // 1. Pull the unified sources + raw payload from the provider.
    //    This already enumerated every server (HLS/MP4/iframe/megaplay).
    const sources = await provider.getSources({
      id: resolvedId,
      epNum: ep,
      server,
      sourceType: type,
    });

    // 2. Probe every non-iframe source in parallel — actually fetch the
    //    upstream URL and capture what came back. Iframe sources are
    //    passthrough (their playable URL is what matters).
    const probeResults = await Promise.all(
      sources.sources.map(async (s, i) => {
        const upstreamUrl = s.originalUrl || s.url;
        const referer = s.upstreamReferer || "https://ani.pm/";

        if (s.type === "iframe") {
          return {
            index: i,
            type: "iframe" as const,
            kind: "iframe",
            url: s.url,
            upstream_url: upstreamUrl,
            upstream_referer: referer,
            quality: s.quality,
            note: "iframe — browser solves Cloudflare challenge natively; not probed server-side",
          };
        }

        if (s.type === "mp4") {
          const probe = await probeMp4(upstreamUrl, referer);
          return {
            index: i,
            type: "mp4" as const,
            kind: "file",
            url: s.url,
            upstream_url: upstreamUrl,
            upstream_referer: referer,
            quality: s.quality,
            ...probe,
          };
        }

        // type === "master" or any HLS variant
        const probe = await probeHls(upstreamUrl, referer);
        return {
          index: i,
          type: s.type,
          kind:
            s.originalUrl && s.originalUrl.includes("megaplay")
              ? "megaplay-hls"
              : "anipm-onyx-hls",
          url: s.url,
          upstream_url: upstreamUrl,
          upstream_referer: referer,
          quality: s.quality,
          // probe.is_master is authoritative — it actually fetched the playlist
          // and parsed it. s.isMaster is just the provider's pre-probe guess.
          ...probe,
        };
      })
    );

    // 3. Group probes by kind for the response.
    const byKind: Record<string, typeof probeResults> = {
      hls: [],
      mp4: [],
      iframe: [],
    };
    for (const p of probeResults) {
      if (
        p.type === "master" ||
        p.kind === "megaplay-hls" ||
        p.kind === "anipm-onyx-hls"
      ) {
        byKind.hls.push(p);
      } else if (p.type === "mp4") {
        byKind.mp4.push(p);
      } else {
        byKind.iframe.push(p);
      }
    }

    // 4. Return the full raw scrape payload.
    const rawPayload = sources.raw as Record<string, unknown> | undefined;

    return NextResponse.json(
      {
        provider: "anipm",
        endpoint: "/api/scrape/anipm-raw",
        description:
          "Deep raw scrape — every server probed, m3u8 content fetched, MP4 headers captured, iframe URLs recorded. Not just iframe shit.",
        requestedId: id,
        animeId: resolvedId,
        episode: ep,
        streamType: type,
        server: sources.server,

        // -----------------------------------------------------------------
        // Per-server probe results — the meat of this endpoint.
        // -----------------------------------------------------------------
        servers: probeResults,

        servers_grouped: {
          hls: byKind.hls,
          mp4: byKind.mp4,
          iframe: byKind.iframe,
          counts: {
            hls: byKind.hls.length,
            mp4: byKind.mp4.length,
            iframe: byKind.iframe.length,
            total: probeResults.length,
          },
        },

        // -----------------------------------------------------------------
        // The full upstream payload from anipm's /api/anime/src/servers
        // endpoint — unmodified, as ani.pm returned it. Useful for
        // debugging when a server disappears or changes kind.
        // -----------------------------------------------------------------
        upstream_servers: rawPayload?.upstream_servers ?? null,

        // -----------------------------------------------------------------
        // MegaPlay extraction diagnostics (full pipeline trace).
        // -----------------------------------------------------------------
        megaplay: rawPayload?.megaplay ?? null,

        // -----------------------------------------------------------------
        // Subtitles + skip markers (intro/outro) — same as /sources.
        // -----------------------------------------------------------------
        subtitles: sources.subtitles,
        skips: sources.skips ?? null,

        // -----------------------------------------------------------------
        // The unified sources array (same shape as /api/scrape/sources)
        // — included for convenience so a developer can hit one endpoint
        // and see both the player-ready URLs AND the deep-scraped data.
        // -----------------------------------------------------------------
        unified_sources: sources.sources,

        // -----------------------------------------------------------------
        // API URL trace — which upstream endpoints we hit to build this.
        // -----------------------------------------------------------------
        api: rawPayload?.api ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "anipm-raw scrape failed.",
        provider: "anipm",
        requestedId: id,
        episode: ep,
      },
      { status: 502 }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Probing helpers                                                    */
/* ------------------------------------------------------------------ */

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MAX_M3U8_BYTES = 64 * 1024; // 64KB cap on raw_m3u8 — enough for any master playlist

/**
 * Build the standard browser-header curl args we send for every probe.
 * Cloudflare's managed challenge on ani.pm / megaplay.buzz / nekostream.site
 * blocks Node's undici via TLS fingerprinting — curl with the full Sec-Ch-Ua
 * + Sec-Fetch-* set sails through.
 */
function buildCurlHeaders(referer: string): string[] {
  return [
    "-A", BROWSER_UA,
    "-H", `Referer: ${referer}`,
    "-H", `Origin: ${referer.replace(/\/$/, "")}`,
    "-H", "Accept: */*",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", 'Sec-Ch-Ua: "Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "-H", "Sec-Ch-Ua-Mobile: ?0",
    "-H", 'Sec-Ch-Ua-Platform: "Windows"',
    "-H", "Sec-Fetch-Dest: empty",
    "-H", "Sec-Fetch-Mode: cors",
    "-H", "Sec-Fetch-Site: cross-site",
  ];
}

/**
 * Fetch an HLS playlist and parse it. Returns the raw text (capped), the
 * variant count (for master playlists), the segment count + total duration
 * (for media playlists), and the first variant/segment URL resolved to
 * absolute.
 */
async function probeHls(
  url: string,
  referer: string
): Promise<{
  http_status: number;
  content_type: string;
  raw_m3u8: string | null;
  raw_m3u8_truncated: boolean;
  is_master: boolean;
  variant_count: number;
  segment_count: number;
  duration_seconds: number | null;
  first_variant_url: string | null;
  first_segment_url: string | null;
  error?: string;
}> {
  const empty = {
    http_status: 0,
    content_type: "",
    raw_m3u8: null,
    raw_m3u8_truncated: false,
    is_master: false,
    variant_count: 0,
    segment_count: 0,
    duration_seconds: null,
    first_variant_url: null,
    first_segment_url: null,
  };

  try {
    const args = [
      "-sSL",
      ...buildCurlHeaders(referer),
      "-D", "-", // dump headers BEFORE body
      "--max-time", "20",
      "--max-filesize", "2048000", // 2MB hard cap — anything bigger is bogus
      url,
    ];

    const raw = await new Promise<string>((resolve, reject) => {
      execFile(
        "curl",
        args,
        { encoding: "utf-8", maxBuffer: 4 * 1024 * 1024 },
        (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        }
      );
    });

    // Split headers from body (curl -D - writes headers, then \r\n\r\n, then body)
    const headerEnd = raw.indexOf("\r\n\r\n");
    if (headerEnd < 0) {
      return { ...empty, error: "no_header_boundary" };
    }
    const headerBlock = raw.slice(0, headerEnd);
    const body = raw.slice(headerEnd + 4);

    // Parse status + content-type from header block
    let httpStatus = 200;
    let contentType = "";
    for (const line of headerBlock.split("\r\n")) {
      if (line.startsWith("HTTP/")) {
        const parts = line.split(" ");
        httpStatus = parseInt(parts[1] || "0", 10) || 0;
      } else if (line.toLowerCase().startsWith("content-type:")) {
        contentType = line.slice(13).trim();
      }
    }

    if (httpStatus !== 200) {
      return {
        ...empty,
        http_status: httpStatus,
        content_type: contentType,
        error: `http_${httpStatus}`,
      };
    }

    // Truncate the raw m3u8 if it's huge
    const truncated = body.length > MAX_M3U8_BYTES;
    const rawM3u8 = truncated ? body.slice(0, MAX_M3U8_BYTES) : body;

    // Parse the playlist
    const parsed = parseM3u8(body, url);

    return {
      http_status: httpStatus,
      content_type: contentType,
      raw_m3u8: rawM3u8,
      raw_m3u8_truncated: truncated,
      is_master: parsed.isMaster,
      variant_count: parsed.variantCount,
      segment_count: parsed.segmentCount,
      duration_seconds: parsed.durationSeconds,
      first_variant_url: parsed.firstVariantUrl,
      first_segment_url: parsed.firstSegmentUrl,
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : "hls_probe_failed",
    };
  }
}

/**
 * HEAD-probe an MP4 URL to get Content-Length, Content-Type, Accept-Ranges,
 * Last-Modified, ETag. Doesn't download the file — just headers.
 */
async function probeMp4(
  url: string,
  referer: string
): Promise<{
  http_status: number;
  content_type: string;
  content_length: number | null;
  accept_ranges: string;
  last_modified: string;
  etag: string;
  error?: string;
}> {
  const empty = {
    http_status: 0,
    content_type: "",
    content_length: null,
    accept_ranges: "",
    last_modified: "",
    etag: "",
  };

  try {
    // Use -I (HEAD) to fetch ONLY headers — much faster than a full GET.
    const args = [
      "-sSI",
      ...buildCurlHeaders(referer),
      "--max-time", "15",
      url,
    ];

    const headerBlock = await new Promise<string>((resolve, reject) => {
      execFile(
        "curl",
        args,
        { encoding: "utf-8", maxBuffer: 64 * 1024 },
        (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        }
      );
    });

    let httpStatus = 200;
    let contentType = "";
    let contentLength: number | null = null;
    let acceptRanges = "";
    let lastModified = "";
    let etag = "";

    for (const line of headerBlock.split("\r\n")) {
      if (line.startsWith("HTTP/")) {
        const parts = line.split(" ");
        httpStatus = parseInt(parts[1] || "0", 10) || 0;
      } else if (line.toLowerCase().startsWith("content-type:")) {
        contentType = line.slice(13).trim();
      } else if (line.toLowerCase().startsWith("content-length:")) {
        const n = parseInt(line.slice(15).trim(), 10);
        if (Number.isFinite(n) && n >= 0) contentLength = n;
      } else if (line.toLowerCase().startsWith("accept-ranges:")) {
        acceptRanges = line.slice(14).trim();
      } else if (line.toLowerCase().startsWith("last-modified:")) {
        lastModified = line.slice(14).trim();
      } else if (line.toLowerCase().startsWith("etag:")) {
        etag = line.slice(5).trim();
      }
    }

    return {
      http_status: httpStatus,
      content_type: contentType,
      content_length: contentLength,
      accept_ranges: acceptRanges,
      last_modified: lastModified,
      etag,
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : "mp4_probe_failed",
    };
  }
}

/* ------------------------------------------------------------------ */
/*  m3u8 parser                                                        */
/* ------------------------------------------------------------------ */

interface M3u8ParseResult {
  isMaster: boolean;
  variantCount: number;
  segmentCount: number;
  durationSeconds: number | null;
  firstVariantUrl: string | null;
  firstSegmentUrl: string | null;
}

/**
 * Parse an m3u8 playlist. We don't need a full HLS parser — we just need
 * to know: is this a master or media playlist, how many variants/segments,
 * what's the total duration (for media playlists), and what's the first
 * variant/segment URL (resolved to absolute).
 *
 * Master playlist signals:
 *   - Has #EXT-X-STREAM-INF:BANDWIDTH=... lines followed by a variant URI
 *
 * Media playlist signals:
 *   - Has #EXTINF:<duration>, lines followed by a segment URI
 */
function parseM3u8(body: string, baseUrl: string): M3u8ParseResult {
  const lines = body.split(/\r?\n/);
  let isMaster = false;
  let variantCount = 0;
  let segmentCount = 0;
  let durationSeconds = 0;
  let firstVariantUrl: string | null = null;
  let firstSegmentUrl: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      isMaster = true;
      // The next non-empty, non-comment line is the variant URL
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || next.startsWith("#")) continue;
        variantCount++;
        if (!firstVariantUrl) firstVariantUrl = resolveUrl(next, baseUrl);
        break;
      }
    } else if (line.startsWith("#EXTINF:")) {
      // Format: #EXTINF:<duration>,<title>
      const commaIdx = line.indexOf(",");
      const colonIdx = line.indexOf(":");
      const durationStr =
        commaIdx > 0 ? line.slice(colonIdx + 1, commaIdx) : line.slice(colonIdx + 1);
      const dur = parseFloat(durationStr);
      if (Number.isFinite(dur)) {
        durationSeconds += dur;
      }
      // Next non-comment line is the segment URL
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || next.startsWith("#")) continue;
        segmentCount++;
        if (!firstSegmentUrl) firstSegmentUrl = resolveUrl(next, baseUrl);
        break;
      }
    }
  }

  return {
    isMaster,
    variantCount,
    segmentCount,
    durationSeconds: segmentCount > 0 ? Math.round(durationSeconds * 10) / 10 : null,
    firstVariantUrl,
    firstSegmentUrl,
  };
}

/** Resolve a possibly-relative URL against the playlist's base URL. */
function resolveUrl(maybeRelative: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  try {
    return new URL(maybeRelative, baseUrl).href;
  } catch {
    return maybeRelative;
  }
}
