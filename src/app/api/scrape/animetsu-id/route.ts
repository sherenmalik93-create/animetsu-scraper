import { NextRequest, NextResponse } from "next/server";
import { resolveIdVerbose } from "@/lib/providers/resolve";
import { getAniListMedia } from "@/lib/anilist/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/scrape/animetsu-id?anilist=<anilistId>
 *
 * Animetsu ID Finding — purpose-built resolver for the animetsu provider.
 *
 * Animetsu uses 24-char Mongo ObjectIds (e.g. "6989b8a029cf95f4eb03b500")
 * as its internal anime id. End-users never know these — but they DO know
 * the AniList id (visible in every anilist.co URL). This endpoint bridges
 * that gap: pass an AniList id, get back the animetsu Mongo ObjectId plus
 * the resolution trace (which title matched, which titles were tried).
 *
 * Internally calls the same resolver that /sources, /episodes, /info use
 * when given an `al:{anilistId}` id — so the result is guaranteed to be
 * identical to what those endpoints will resolve to on the next call.
 *
 * Response:
 *   {
 *     anilistId: 154587,
 *     animetsuId: "6989b8a029cf95f4eb03b500",   ← pass this to /sources?id=...
 *     matchedTitle: "Frieren: Beyond Journey's End",
 *     strategy: "title-search" | "cache-hit" | "passthrough",
 *     triedTitles: ["Frieren: Beyond Journey's End", "Sousou no Frieren", ...],
 *     anilist: { id, idMal, title, synonyms, coverImage, seasonYear, format },
 *     universalId: "al:154587"                  ← works on every provider
 *   }
 *
 * Returns 404 if the anime isn't found on animetsu's catalog after trying
 * every candidate title.
 *
 * Example:
 *   curl ".../api/scrape/animetsu-id?anilist=154587"
 *   → { animetsuId: "6989b8a029cf95f4eb03b500", ... }
 */
export async function GET(req: NextRequest) {
  const anilistRaw = req.nextUrl.searchParams.get("anilist");

  if (!anilistRaw) {
    return NextResponse.json(
      {
        error:
          "Missing 'anilist' param. Usage: /api/scrape/animetsu-id?anilist=154587",
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
    // cover image, and candidate search queries — useful for the UI page
    // and for debugging failed lookups.
    const media = await getAniListMedia(anilistId).catch(() => null);

    if (!media) {
      return NextResponse.json(
        {
          error: `AniList ID ${anilistId} not found on AniList.`,
          anilistId,
        },
        { status: 404 }
      );
    }

    const resolved = await resolveIdVerbose("animetsu", `al:${anilistId}`);

    if (!resolved) {
      return NextResponse.json(
        {
          error: `Could not resolve AniList ID ${anilistId} on animetsu.`,
          anilistId,
          anilist: {
            id: media.id,
            idMal: media.idMal,
            title: media.title,
            synonyms: media.synonyms ?? [],
            coverImage: media.coverImage,
            seasonYear: media.seasonYear,
            format: media.format,
          },
          triedTitles: [
            media.title?.english,
            media.title?.romaji,
            media.title?.native,
            ...(media.synonyms || []),
          ].filter((t): t is string => Boolean(t && t.trim().length > 1)),
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        anilistId,
        animetsuId: resolved.nativeId,
        matchedTitle: resolved.matchedTitle,
        strategy: resolved.strategy,
        triedTitles: resolved.triedTitles ?? [],
        anilist: {
          id: media.id,
          idMal: media.idMal,
          title: media.title,
          synonyms: media.synonyms ?? [],
          coverImage: media.coverImage,
          seasonYear: media.seasonYear,
          format: media.format,
        },
        universalId: `al:${anilistId}`,
        // Convenience: a ready-to-use /sources URL with the resolved native id.
        sourcesUrl: `/api/scrape/sources?id=${encodeURIComponent(
          resolved.nativeId
        )}&provider=animetsu&ep=1`,
        // Convenience: a ready-to-use /sources URL with the universal id.
        universalSourcesUrl: `/api/scrape/sources?id=al%3A${anilistId}&provider=animetsu&ep=1`,
      },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Animetsu ID lookup failed." },
      { status: 502 }
    );
  }
}
