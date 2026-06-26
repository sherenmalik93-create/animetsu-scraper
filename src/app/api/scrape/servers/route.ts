import { NextRequest, NextResponse } from "next/server";
import { getServers } from "@/lib/animetsu/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const ep = Number(req.nextUrl.searchParams.get("ep"));
  if (!id || !ep) {
    return NextResponse.json({ error: "Missing id or ep." }, { status: 400 });
  }
  try {
    const servers = await getServers(id, ep);
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
