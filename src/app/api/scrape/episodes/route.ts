import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { resolveIdForProvider } from "@/lib/providers/resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/scrape/episodes?id=<animeId>&provider=<providerId>
 *
 * The `id` parameter accepts ANY of these formats:
 *   - Provider-native id
 *   - `al:{anilistId}` — universal, works on EVERY provider
 *   - `al:{anilistId}:{slug}` — anilight / anipm composite format
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const providerId = req.nextUrl.searchParams.get("provider") || "animetsu";
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }
  try {
    const provider = getProvider(providerId);
    const resolvedId = await resolveIdForProvider(providerId, id);
    const episodes = await provider.getEpisodes(resolvedId);
    return NextResponse.json(episodes, {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Episodes failed." },
      { status: 502 }
    );
  }
}
