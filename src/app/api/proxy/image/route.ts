/**
 * Image CORS proxy for upstream image URLs.
 *
 * OniSaga and other providers serve images from signed CDN URLs that block
 * cross-origin requests. This proxy fetches the image server-side and
 * streams it back with permissive CORS headers.
 *
 * Usage:
 *   GET /api/proxy/image?url=<encoded>&referer=<encoded>
 *   OPTIONS /api/proxy/image
 */

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Type, Content-Length",
  "Access-Control-Max-Age": "86400",
};

/** Cloudflare-protected hosts that need curl instead of Node fetch. */
const CURL_HOSTS = [
  /onisaga\.com$/i,
  /anime-dunya\.com$/i,
  /animekhor\.(org|xyz)$/i,
];

function needsCurl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return CURL_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

/**
 * Curl-backed streaming fetch for Cloudflare-protected hosts.
 */
async function curlFetchImage(
  target: string,
  referer: string
): Promise<{ status: number; headers: Map<string, string>; body: ReadableStream<Uint8Array> }> {
  const args = [
    "-sS",
    "-A", BROWSER_UA,
    "-H", `Referer: ${referer}`,
    "-H", "Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-D", "-",
    "--max-time", "30",
    target,
  ];

  const child = spawn("curl", args);

  let headersDone = false;
  let status = 200;
  const headers = new Map<string, string>();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let buf = Buffer.alloc(0);

      child.stdout.on("data", (chunk: Buffer) => {
        if (headersDone) {
          controller.enqueue(new Uint8Array(chunk));
          return;
        }

        buf = Buffer.concat([buf, chunk]);
        const headerEnd = buf.indexOf("\r\n\r\n");
        if (headerEnd < 0) return;

        const headerBlock = buf.slice(0, headerEnd).toString("utf-8");
        for (const line of headerBlock.split("\r\n")) {
          if (line.startsWith("HTTP/")) {
            const parts = line.split(" ");
            status = parseInt(parts[1] || "200", 10) || 200;
          } else if (line.includes(":")) {
            const idx = line.indexOf(":");
            const k = line.slice(0, idx).trim().toLowerCase();
            const v = line.slice(idx + 1).trim();
            if (k) headers.set(k, v);
          }
        }

        headersDone = true;
        const bodyStart = headerEnd + 4;
        if (buf.length > bodyStart) {
          controller.enqueue(new Uint8Array(buf.slice(bodyStart)));
        }
      });

      child.stdout.on("end", () => controller.close());
      child.stdout.on("error", (e) => controller.error(e));
      child.on("error", (e) => controller.error(e));
    },
    cancel() {
      child.kill("SIGTERM");
    },
  });

  return { status, headers, body: stream };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Content-Length": "0" },
  });
}

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
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

  // Determine referer
  let referer = refererOverride || "";
  if (!referer) {
    try {
      const u = new URL(target);
      referer = `${u.protocol}//${u.host}/`;
    } catch {
      referer = "https://onisaga.com/";
    }
  }

  try {
    if (needsCurl(target)) {
      // Use curl for Cloudflare-protected hosts
      const r = await curlFetchImage(target, referer);

      if (r.status >= 400) {
        return new NextResponse(r.body, {
          status: r.status,
          headers: { ...CORS_HEADERS },
        });
      }

      const contentType = r.headers.get("content-type") || "image/jpeg";
      const contentLength = r.headers.get("content-length");

      const responseHeaders: Record<string, string> = {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      };
      if (contentLength) responseHeaders["Content-Length"] = contentLength;

      return new NextResponse(r.body, {
        status: 200,
        headers: responseHeaders,
      });
    } else {
      // Use Node fetch for non-CF hosts
      const upstream = await fetch(target, {
        headers: {
          "User-Agent": BROWSER_UA,
          Referer: referer,
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        cache: "no-store",
        redirect: "follow",
      });

      if (!upstream.ok) {
        return new NextResponse(upstream.body, {
          status: upstream.status,
          headers: { ...CORS_HEADERS },
        });
      }

      const contentType = upstream.headers.get("content-type") || "image/jpeg";
      const contentLength = upstream.headers.get("content-length");

      const responseHeaders: Record<string, string> = {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      };
      if (contentLength) responseHeaders["Content-Length"] = contentLength;

      return new NextResponse(upstream.body as ReadableStream<Uint8Array>, {
        status: 200,
        headers: responseHeaders,
      });
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch image.",
      },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
