import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { resolveIdForProvider } from "@/lib/providers/resolve";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/scrape/servers?id=<animeId>&ep=<epNum>&provider=<providerId>
 *
 * The `id` parameter accepts ANY of these formats:
 *   - Provider-native id
 *   - `al:{anilistId}` — universal, works on EVERY provider
 *   - `al:{anilistId}:{slug}` — anilight / anipm composite format
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const ep = Number(req.nextUrl.searchParams.get("ep"));
  const providerId = req.nextUrl.searchParams.get("provider") || "animetsu";
  if (!id || !ep) {
    return NextResponse.json({ error: "Missing id or ep." }, { status: 400 });
  }
  try {
    const provider = getProvider(providerId);
    if (!provider.getServers) {
      return NextResponse.json([]);
    }
    const resolvedId = await resolveIdForProvider(providerId, id);
    const servers = await provider.getServers(resolvedId, ep);
    return NextResponse.json(servers, {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Servers failed." },
      { status: 502 }
    );
  }
}
