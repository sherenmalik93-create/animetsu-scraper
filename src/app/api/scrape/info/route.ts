import { NextRequest, NextResponse } from "next/server";
import { getAnimeInfo } from "@/lib/animetsu/client";
import { enrichWithAniList } from "@/lib/anilist/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }
  const enrich = req.nextUrl.searchParams.get("enrich") !== "0";

  try {
    const info = await getAnimeInfo(id);
    if (!enrich) {
      return NextResponse.json(info, {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=600" },
      });
    }
    const { anilist } = await enrichWithAniList(info);
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
