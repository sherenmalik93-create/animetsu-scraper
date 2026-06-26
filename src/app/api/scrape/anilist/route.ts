import { NextRequest, NextResponse } from "next/server";
import { getAniListMedia, searchAniList, getTrending } from "@/lib/anilist/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/scrape/anilist?id=<anilistId>            — fetch one media
 * GET /api/scrape/anilist?search=<query>            — search
 * GET /api/scrape/anilist?trending=1                — trending now
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const search = req.nextUrl.searchParams.get("search");
  const trending = req.nextUrl.searchParams.get("trending");

  try {
    if (id) {
      const media = await getAniListMedia(Number(id));
      return NextResponse.json(media, {
        headers: { "Cache-Control": "public, max-age=600, s-maxage=1800" },
      });
    }
    if (trending) {
      const list = await getTrending();
      return NextResponse.json(list, {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=900" },
      });
    }
    if (search) {
      const list = await searchAniList(search, 20);
      return NextResponse.json(list, {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=900" },
      });
    }
    return NextResponse.json({ error: "Provide id, search, or trending param." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AniList failed." },
      { status: 502 }
    );
  }
}
