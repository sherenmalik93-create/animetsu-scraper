import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/scrape/sources?provider=<anikuro|animetsu>&id=<id>&ep=<epNum>&server=<serverId>&type=<sub|dub>
 *
 * Returns a player-ready payload:
 *   {
 *     sources: [{ url, type, quality, isMaster, originalUrl, upstreamReferer }],
 *     subtitles: [{ url, lang }],
 *     skips: { intro, outro },
 *     server, provider, qualities
 *   }
 *
 * The `url` field on each source is already wrapped through our CORS proxy
 * when needed (HLS), or points at the upstream MP4 proxy directly (MP4).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const ep = Number(req.nextUrl.searchParams.get("ep"));
  const server = req.nextUrl.searchParams.get("server") || undefined;
  const type = (req.nextUrl.searchParams.get("type") || "sub") as "sub" | "dub";
  const providerId = req.nextUrl.searchParams.get("provider") || "animetsu";

  if (!id || !ep) {
    return NextResponse.json({ error: "Missing id or ep." }, { status: 400 });
  }

  try {
    const provider = getProvider(providerId);
    const sources = await provider.getSources({
      id,
      epNum: ep,
      server,
      sourceType: type,
    });

    return NextResponse.json(sources, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=120" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sources failed." },
      { status: 502 }
    );
  }
}
