import { NextResponse } from "next/server";
import { providerList } from "@/lib/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** List all registered providers — used by the UI to render the switcher. */
export async function GET() {
  return NextResponse.json(
    { providers: providerList.map((p) => p.meta) },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
