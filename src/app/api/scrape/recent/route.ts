import { NextRequest, NextResponse } from "next/server";
import { ANIMETSU_API_BASE, AnimetsuError } from "@/lib/animetsu/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Recent releases — proxy the upstream `recent` endpoint. */
export async function GET(req: NextRequest) {
  const page = Number(req.nextUrl.searchParams.get("page") || "1");
  const perPage = Number(req.nextUrl.searchParams.get("per_page") || "20");
  try {
    const url = `${ANIMETSU_API_BASE}/recent?page=${page}&per_page=${perPage}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://animetsu.live/",
        Accept: "application/json, text/plain, */*",
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      throw new AnimetsuError(`Upstream returned ${res.status}`, res.status);
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : { results: [] };
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=120" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Recent failed." },
      { status: 502 }
    );
  }
}
