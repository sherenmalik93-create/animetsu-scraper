import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const providerId = req.nextUrl.searchParams.get("provider") || "animetsu";
  if (!id) {
    return NextResponse.json({ error: "Missing id." }, { status: 400 });
  }
  try {
    const provider = getProvider(providerId);
    const episodes = await provider.getEpisodes(id);
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
