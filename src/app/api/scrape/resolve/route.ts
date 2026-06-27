import { NextRequest, NextResponse } from "next/server";
import {
  resolveIdVerbose,
  resolveAcrossAllProviders,
  extractAnilistId,
} from "@/lib/providers/resolve";
import { getAniListMedia } from "@/lib/anilist/client";
import type { ProviderId } from "@/lib/providers/types";
import { isProviderId } from "@/lib/providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/scrape/resolve?anilist=<anilistId>&provider=<providerId>
 *
 * Resolves an AniList id to the provider's native anime id. Useful for:
 *   - Figuring out what id to pass to /api/scrape/sources on a given provider
 *   - Checking whether a provider has a given anime before doing a full
 *     /sources lookup
 *   - Debugging the universal AniList routing
 *
 * If `provider` is omitted, resolves across ALL providers in parallel and
 * returns a map of { providerId: ResolveResult | null }.
 *
 * Examples:
 *   /api/scrape/resolve?anilist=154587&provider=animetsu
 *   /api/scrape/resolve?anilist=154587             ← all providers
 */
export async function GET(req: NextRequest) {
  const anilistRaw = req.nextUrl.searchParams.get("anilist");
  const providerId = req.nextUrl.searchParams.get("provider");

  if (!anilistRaw) {
    return NextResponse.json(
      {
        error:
          "Missing 'anilist' param. Usage: /api/scrape/resolve?anilist=154587&provider=animetsu",
      },
      { status: 400 }
    );
  }

  const anilistId = Number(anilistRaw);
  if (!Number.isFinite(anilistId) || anilistId <= 0) {
    return NextResponse.json(
      { error: `'anilist' must be a positive number, got: ${anilistRaw}` },
      { status: 400 }
    );
  }

  try {
    // Always fetch AniList metadata so the response includes the title,
    // cover image, and candidate search queries — useful for debugging.
    const media = await getAniListMedia(anilistId).catch(() => null);

    if (providerId) {
      if (!isProviderId(providerId)) {
        return NextResponse.json(
          { error: `Unknown provider: ${providerId}` },
          { status: 400 }
        );
      }
      const resolved = await resolveIdVerbose(
        providerId as ProviderId,
        `al:${anilistId}`
      );
      return NextResponse.json(
        {
          anilistId,
          provider: providerId,
          anilist: media
            ? {
                id: media.id,
                idMal: media.idMal,
                title: media.title,
                synonyms: media.synonyms ?? [],
                coverImage: media.coverImage,
                seasonYear: media.seasonYear,
                format: media.format,
              }
            : null,
          resolved,
        },
        { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } }
      );
    }

    // No provider specified — resolve across all providers in parallel.
    const all = await resolveAcrossAllProviders(anilistId);
    return NextResponse.json(
      {
        anilistId,
        anilist: media
          ? {
              id: media.id,
              idMal: media.idMal,
              title: media.title,
              synonyms: media.synonyms ?? [],
              coverImage: media.coverImage,
              seasonYear: media.seasonYear,
              format: media.format,
            }
          : null,
        resolved: all,
      },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Resolve failed." },
      { status: 502 }
    );
  }
}

/** Helper for other routes — exported so they can call resolveIdForProvider
 *  without re-importing from /lib. */
export { extractAnilistId };
