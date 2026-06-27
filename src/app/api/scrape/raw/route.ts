import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { resolveIdForProvider } from "@/lib/providers/resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/scrape/raw?provider=<id>&id=<animeId>&ep=<epNum>&server=<serverId>&type=<sub|dub>
 *
 * Returns ONLY the raw upstream payload — the original JSON the provider's
 * API returned, before any normalization. This is what the UI's "Show raw
 * response" panel surfaces so developers can inspect the underlying data
 * (provider name, server id, cdn host, variants, skip markers, subtitles,
 * embed URLs, etc.).
 *
 * The response shape varies per provider:
 *   - animetsu:  the upstream `SourcesResponse` object (sources[], subs[], skips)
 *   - anikuro:   `{ rawMulti: { <providerName>: <data>, ... }, chosen: <data> }`
 *   - animeyubi: `{ provider, api, episode, normalized: [...] }`
 *
 * The `id` parameter accepts ANY of these formats:
 *   - Provider-native id
 *   - `al:{anilistId}` — universal, works on EVERY provider
 *   - `al:{anilistId}:{slug}` — anilight / anipm composite format
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
    const resolvedId = await resolveIdForProvider(providerId, id);
    const sources = await provider.getSources({
      id: resolvedId,
      epNum: ep,
      server,
      sourceType: type,
    });

    return NextResponse.json(
      {
        provider: provider.meta.id,
        animeId: resolvedId,
        requestedId: id,
        episode: ep,
        server: sources.server,
        streamType: type,
        raw: sources.raw ?? null,
        rawMulti: sources.rawMulti ?? null,
        // Also surface the player-ready sources for convenience — this way
        // a developer can hit one endpoint and see both shapes side by side.
        unified: {
          sources: sources.sources,
          subtitles: sources.subtitles,
          skips: sources.skips,
          qualities: sources.qualities,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Raw fetch failed." },
      { status: 502 }
    );
  }
}
