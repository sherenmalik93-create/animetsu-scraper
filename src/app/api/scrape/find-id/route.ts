import { NextRequest, NextResponse } from "next/server";
import {
  resolveIdVerbose,
  resolveAcrossAllProviders,
} from "@/lib/providers/resolve";
import { getAniListMedia } from "@/lib/anilist/client";
import { isProviderId, providers } from "@/lib/providers";
import type { ProviderId } from "@/lib/providers/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/scrape/find-id?anilist=<anilistId>&provider=<providerId>
 *
 * Universal ID Finder — looks up an AniList ID and returns the native id
 * for the requested provider (or for ALL providers if `provider` is omitted).
 *
 * This is the API backing the /animetsu-id (now "ID Finder") UI page.
 * It's a friendlier wrapper around /api/scrape/resolve that:
 *   - Always includes the AniList media metadata
 *   - Returns ready-to-use /sources URLs (native + universal)
 *   - When `provider` is omitted, resolves across every provider in parallel
 *     and returns a per-provider breakdown
 *
 * Response (single provider):
 *   {
 *     anilistId, provider, anilist: { id, idMal, title, synonyms, coverImage, ... },
 *     resolved: {
 *       nativeId, anilistId, provider, matchedTitle,
 *       strategy: "passthrough" | "title-search" | "cache-hit",
 *       triedTitles: string[]
 *     },
 *     nativeId: string,           ← convenience alias for resolved.nativeId
 *     universalId: "al:{anilistId}",
 *     sourcesUrl: string,         ← /sources with the resolved native id
 *     universalSourcesUrl: string ← /sources with the universal id
 *   }
 *
 * Response (all providers):
 *   {
 *     anilistId, anilist: {...},
 *     providers: {
 *       animetsu: { resolved, nativeId, sourcesUrl, ... } | null,
 *       anikuro:  { ... } | null,
 *       ... 7 providers total
 *     },
 *     availableCount: number,     ← how many providers have this anime
 *     bestProvider: ProviderId    ← first provider that resolved (priority order)
 *   }
 *
 * Examples:
 *   /api/scrape/find-id?anilist=154587                      ← all providers
 *   /api/scrape/find-id?anilist=154587&provider=animetsu    ← just animetsu
 *   /api/scrape/find-id?anilist=154587&provider=anipm       ← just anipm
 */
export async function GET(req: NextRequest) {
  const anilistRaw = req.nextUrl.searchParams.get("anilist");
  const providerId = req.nextUrl.searchParams.get("provider");

  if (!anilistRaw) {
    return NextResponse.json(
      {
        error:
          "Missing 'anilist' param. Usage: /api/scrape/find-id?anilist=154587&provider=animetsu",
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

    const anilistMeta = {
      id: media.id,
      idMal: media.idMal,
      title: media.title,
      synonyms: media.synonyms ?? [],
      coverImage: media.coverImage,
      seasonYear: media.seasonYear,
      format: media.format,
    };

    // -----------------------------------------------------------------
    // Single-provider mode
    // -----------------------------------------------------------------
    if (providerId) {
      if (!isProviderId(providerId)) {
        return NextResponse.json(
          {
            error: `Unknown provider: ${providerId}. Valid: animetsu, anikuro, animeyubi, miruro, animex, anilight, anipm.`,
            anilistId,
          },
          { status: 400 }
        );
      }

      const pid = providerId as ProviderId;
      const resolved = await resolveIdVerbose(pid, `al:${anilistId}`);

      if (!resolved) {
        const triedTitles = [
          media.title?.english,
          media.title?.romaji,
          media.title?.native,
          ...(media.synonyms || []),
        ].filter((t): t is string => Boolean(t && t.trim().length > 1));

        return NextResponse.json(
          {
            error: `Could not resolve AniList ID ${anilistId} on ${pid}.`,
            anilistId,
            provider: pid,
            anilist: anilistMeta,
            triedTitles,
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          anilistId,
          provider: pid,
          anilist: anilistMeta,
          resolved,
          nativeId: resolved.nativeId,
          universalId: `al:${anilistId}`,
          sourcesUrl: `/api/scrape/sources?id=${encodeURIComponent(
            resolved.nativeId
          )}&provider=${pid}&ep=1`,
          universalSourcesUrl: `/api/scrape/sources?id=al%3A${anilistId}&provider=${pid}&ep=1`,
        },
        { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } }
      );
    }

    // -----------------------------------------------------------------
    // All-providers mode
    // -----------------------------------------------------------------
    const all = await resolveAcrossAllProviders(anilistId);

    const providerIds: ProviderId[] = [
      "animetsu",
      "anikuro",
      "animeyubi",
      "miruro",
      "animex",
      "anilight",
      "anipm",
      "mkissa",
      "animedunya",
      "animekhor",
    ];

    const providersResult: Record<string, unknown> = {};
    let availableCount = 0;
    let bestProvider: ProviderId | null = null;

    for (const pid of providerIds) {
      const r = all[pid];
      if (r) {
        availableCount++;
        if (!bestProvider) bestProvider = pid;
        providersResult[pid] = {
          resolved: r,
          nativeId: r.nativeId,
          universalId: `al:${anilistId}`,
          sourcesUrl: `/api/scrape/sources?id=${encodeURIComponent(
            r.nativeId
          )}&provider=${pid}&ep=1`,
          universalSourcesUrl: `/api/scrape/sources?id=al%3A${anilistId}&provider=${pid}&ep=1`,
          label: providers[pid].meta.label,
        };
      } else {
        providersResult[pid] = null;
      }
    }

    return NextResponse.json(
      {
        anilistId,
        anilist: anilistMeta,
        providers: providersResult,
        availableCount,
        bestProvider,
        universalId: `al:${anilistId}`,
      },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=600" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "ID lookup failed." },
      { status: 502 }
    );
  }
}
