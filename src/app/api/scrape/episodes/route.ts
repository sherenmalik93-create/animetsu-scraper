import { NextRequest, NextResponse } from "next/server";
import { getEpisodes } from "@/lib/animetsu/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }
  try {
    const eps = await getEpisodes(id);
    return NextResponse.json(eps, {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=600" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Episodes failed." },
      { status: 502 }
    );
  }
}
