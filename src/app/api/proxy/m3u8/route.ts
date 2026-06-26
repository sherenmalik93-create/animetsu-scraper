/**
 * CORS proxy for upstream m3u8 / segment / subtitle URLs.
 *
 * The browser cannot directly fetch `https://swiftstream.top/...` from our
 * own domain because of CORS rules — swiftstream.top returns
 * `access-control-allow-origin: *` for the playlist itself, but the
 * segment requests sometimes get challenged by Cloudflare. By funnelling
 * everything through this server-side proxy, we get:
 *
 *   1. A single CORS-friendly origin (our own domain)
 *   2. Proper Referer / User-Agent headers so CF doesn't challenge us
 *   3. The ability to rewrite relative playlist URIs so the player
 *      keeps calling us instead of the upstream host
 *
 * Usage:
 *   /api/proxy/m3u8?url=<encoded m3u8 URL>
 *   /api/proxy/m3u8?url=<encoded>&format=vtt   # for subtitle files
 */

import { NextRequest, NextResponse } from "next/server";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const UPSTREAM_REFERER = "https://animetsu.live/";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function rewritePlaylistUrls(body: string, baseUrl: string): string {
  /**
   * Rewrite relative URIs in an m3u8 playlist so they go back through this proxy.
   * - Lines that are not comments and not blank are URIs (or relative paths).
   * - Some playlists use #EXT-X-KEY with URI="..." that also needs rewriting.
   */
  const proxy = "/api/proxy/m3u8?url=";
  const lines = body.split(/\r?\n/);
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        // Rewrite URIs inside #EXT-X-KEY / #EXT-X-MEDIA tags
        return line.replace(/URI="([^"]+)"/g, (_m, rawUri: string) => {
          if (/^https?:\/\//i.test(rawUri)) {
            return `URI="${proxy}${encodeURIComponent(rawUri)}"`;
          }
          const resolved = new URL(rawUri, baseUrl).href;
          return `URI="${proxy}${encodeURIComponent(resolved)}"`;
        });
      }
      // Plain URI line
      let absolute: string;
      if (/^https?:\/\//i.test(trimmed)) {
        absolute = trimmed;
      } else {
        absolute = new URL(trimmed, baseUrl).href;
      }
      return `${proxy}${encodeURIComponent(absolute)}`;
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  const format = req.nextUrl.searchParams.get("format"); // "vtt" | "m3u8" | undefined
  if (!urlParam) {
    return NextResponse.json({ error: "Missing url parameter." }, { status: 400 });
  }

  let target: string;
  try {
    target = decodeURIComponent(urlParam);
  } catch {
    return NextResponse.json({ error: "Invalid url encoding." }, { status: 400 });
  }
  if (!/^https?:\/\//i.test(target)) {
    return NextResponse.json({ error: "url must be absolute http(s)." }, { status: 400 });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: UPSTREAM_REFERER,
        Origin: UPSTREAM_REFERER.replace(/\/$/, ""),
        Accept: "*/*",
      },
      // We do NOT cache segments; only playlists
      cache: "no-store",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status} ${upstream.statusText}` },
        { status: upstream.status }
      );
    }

    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
    const isPlaylist =
      format === "m3u8" ||
      contentType.includes("mpegurl") ||
      contentType.includes("m3u8") ||
      target.toLowerCase().endsWith(".m3u8") ||
      (!format && (await peekForM3u8(upstream.clone())));

    if (isPlaylist) {
      const body = await upstream.text();
      const rewritten = rewritePlaylistUrls(body, target);
      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "public, max-age=30, s-maxage=60",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Subtitle file (VTT) — pass through with proper content-type
    if (format === "vtt" || contentType.includes("text/vtt") || target.endsWith(".vtt")) {
      const body = await upstream.text();
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "text/vtt; charset=utf-8",
          "Cache-Control": "public, max-age=300, s-maxage=600",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Binary segment (TS / fMP4) — stream through
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proxy failure." },
      { status: 502 }
    );
  }
}

/** Peek at the first 7 chars of a body to detect an m3u8 playlist without consuming it. */
async function peekForM3u8(res: Response): Promise<boolean> {
  try {
    const text = await res.text();
    return text.startsWith("#EXTM3U");
  } catch {
    return false;
  }
}
