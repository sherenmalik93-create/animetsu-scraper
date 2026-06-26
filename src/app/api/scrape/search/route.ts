import { NextRequest, NextResponse } from "next/server";
import { searchAnime } from "@/lib/animetsu/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }
  try {
    const data = await searchAnime({ query: q });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed." },
      { status: 502 }
    );
  }
}
