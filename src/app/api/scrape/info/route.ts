import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { enrichWithAniList } from "@/lib/anilist/client";
import { resolveIdForProvider } from "@/lib/providers/resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/scrape/info?id=<animeId>&provider=<providerId>&enrich=<0|1>
 *
 * The `id` parameter accepts ANY of these formats:
 *   - Provider-native id (e.g. "6989b8a029cf95f4eb03b500" for animetsu)
 *   - `al:{anilistId}` — universal, works on EVERY provider. Resolved to
 *     the provider's native id via AniList title search + provider search.
 *   - `al:{anilistId}:{slug}` — anilight / anipm composite format (passthrough)
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const providerId = req.nextUrl.searchParams.get("provider") || "animetsu";
  const enrich = req.nextUrl.searchParams.get("enrich") !== "0";
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }

  const provider = getProvider(providerId);
  try {
    // Auto-resolve al:{anilistId} to the provider's native id format.
    const resolvedId = await resolveIdForProvider(providerId, id);
    const info = await provider.getInfo(resolvedId);
    if (!info) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (!enrich || !info.anilistId) {
      return NextResponse.json(info, {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=600" },
      });
    }
    const { anilist } = await enrichWithAniList({ anilist_id: info.anilistId });
    return NextResponse.json(
      { ...info, anilist },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Info failed." },
      { status: 502 }
    );
  }
}
