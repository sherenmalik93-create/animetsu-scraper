import { NextRequest, NextResponse } from "next/server";
import { resolveSources } from "@/lib/animetsu/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/scrape/sources?id=<watchId>&ep=<epNum>&server=<kite>&type=<sub|dub>
 *
 * Returns a player-ready payload:
 *   {
 *     masterUrl: "/api/proxy/m3u8?url=<encoded>",
 *     qualities: [{ label, resolution, url }],
 *     subtitles: [{ url, lang }],
 *     skips: { intro: {start,end}, outro: {start,end} },
 *     server, needProxy
 *   }
 *
 * The m3u8 URL is wrapped through /api/proxy/m3u8 so the browser can load it
 * without CORS issues.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const ep = Number(req.nextUrl.searchParams.get("ep"));
  const server = req.nextUrl.searchParams.get("server") || "kite";
  const type = (req.nextUrl.searchParams.get("type") || "sub") as "sub" | "dub";

  if (!id || !ep) {
    return NextResponse.json({ error: "Missing id or ep." }, { status: 400 });
  }

  try {
    const resolved = await resolveSources({
      watchId: id,
      epNum: ep,
      server,
      sourceType: type,
    });

    // Wrap every URL through our CORS proxy
    const proxiedMaster = `/api/proxy/m3u8?url=${encodeURIComponent(resolved.masterUrl)}`;
    const proxiedQualities = resolved.qualities.map((q) => ({
      ...q,
      url: `/api/proxy/m3u8?url=${encodeURIComponent(q.url)}`,
    }));
    const proxiedSubs = resolved.subtitles.map((s) => ({
      lang: s.lang,
      url: `/api/proxy/m3u8?format=vtt&url=${encodeURIComponent(s.url)}`,
    }));

    return NextResponse.json(
      {
        masterUrl: proxiedMaster,
        qualities: proxiedQualities,
        subtitles: proxiedSubs,
        skips: resolved.skips,
        server: resolved.server,
        needProxy: resolved.needProxy,
      },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=120" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sources failed." },
      { status: 502 }
    );
  }
}
