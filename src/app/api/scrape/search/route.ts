import { NextRequest, NextResponse } from "next/server";
import { getProvider, providerList } from "@/lib/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const providerId = req.nextUrl.searchParams.get("provider") || "animetsu";
  const provider = getProvider(providerId);

  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }
  try {
    const results = await provider.search(q);
    return NextResponse.json(
      { results, provider: provider.meta.id },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed." },
      { status: 502 }
    );
  }
}

/** Also expose the list of available providers for the UI. */
export async function HEAD() {
  return NextResponse.json({ providers: providerList.map((p) => p.meta) });
}
