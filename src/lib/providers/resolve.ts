/**
 * Universal AniList ID routing
 * ------------------------------------------------------------------
 *
 * Problem: every provider has its own native id format.
 *   - animetsu:  Mongo ObjectId      ("6989b8a029cf95f4eb03b500")
 *   - anikuro:   numeric             ("4231")
 *   - animeyubi: numeric             ("12345")
 *   - miruro:    al:{anilistId}      ("al:154587")
 *   - animex:    al:{anilistId}      ("al:154587")
 *   - anilight:  al:{anilistId}:{slug} ("al:154587:sousou-no-frieren")
 *   - anipm:     anipm:{seriesId}:{slug} ("anipm:6351:frieren-beyond-...")
 *
 * A user looking at the API docs has no idea what "6989b8a029cf95f4eb03b500"
 * to plug in for Frieren on animetsu — but they DO know the AniList id
 * (154587). This module lets every endpoint accept `al:{anilistId}` as a
 * universal id, and resolves it to the provider's native format on the fly.
 *
 * Resolution strategy:
 *   - miruro / animex / anilight: pass `al:{id}` straight through — these
 *     providers already index by AniList id natively. anilight will fall
 *     back to a slug lookup via its own cache; if that fails it returns
 *     null and we re-resolve via title-search below.
 *   - animetsu / anikuro / animeyubi / anipm: fetch the AniList media,
 *     collect candidate titles (english, romaji, native, synonyms),
 *     search the provider's catalog with each, return the first hit
 *     (preferring results whose `anilistId` field matches the input).
 *
 * Results are cached for 30 min so subsequent /episodes, /servers, /sources
 * calls on the same provider+anime don't re-trigger the upstream search.
 */

import { getAniListMedia } from "@/lib/anilist/client";
import { getProvider, isProviderId } from "./index";
import type { ProviderId, UnifiedSearchResult } from "./types";

const cache = new Map<string, { t: number; v: ResolveResult | null }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

export interface ResolveResult {
  /** The provider-native id to pass to getInfo / getEpisodes / getSources. */
  nativeId: string;
  /** The AniList id we resolved from. */
  anilistId: number;
  /** The provider id. */
  provider: ProviderId;
  /** The title that matched (for debugging / display). */
  matchedTitle?: string;
  /** How the resolution happened. */
  strategy:
    | "passthrough" // native provider, al: already accepted
    | "title-search" // searched upstream by AniList title
    | "cache-hit"; // found in in-memory cache
  /** All candidate titles we tried (only populated for title-search). */
  triedTitles?: string[];
}

/**
 * Providers that natively accept `al:{anilistId}` ids — no resolution needed.
 * miruro and animex use AniList ids as their primary key. anilight accepts
 * `al:{anilistId}` and resolves the slug internally (via its own cache, or
 * by returning null which the caller can retry as a title search).
 */
function providerAcceptsAnilistNative(pid: ProviderId): boolean {
  return pid === "miruro" || pid === "animex" || pid === "anilight";
}

/** True if the id is a bare AniList id with no slug suffix. */
export function isBareAnilistId(id: string): boolean {
  return /^al:\d+$/.test(id.trim());
}

/** True if the id carries a slug (e.g. `al:154587:sousou-no-frieren`). */
export function isAnilistIdWithSlug(id: string): boolean {
  return /^al:\d+:.+$/.test(id.trim());
}

/** Extract the numeric AniList id from `al:{id}` or `al:{id}:{slug}`. */
export function extractAnilistId(id: string): number | null {
  const m = id.trim().match(/^al:(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Collect candidate search queries for an AniList media item, in priority
 * order: english → romaji → native → synonyms. Empty/duplicate entries are
 * filtered out.
 */
function candidateTitles(media: {
  title?: { romaji?: string; english?: string; native?: string };
  synonyms?: string[];
}): string[] {
  const out: string[] = [];
  const push = (t?: string) => {
    if (t && t.trim().length > 1 && !out.includes(t)) out.push(t.trim());
  };
  push(media.title?.english);
  push(media.title?.romaji);
  push(media.title?.native);
  for (const s of media.synonyms || []) push(s);
  return out;
}

/**
 * Try to find a matching search result. Prefers results whose `anilistId`
 * field matches the input — this is the most reliable signal when the
 * upstream exposes it (anikuro, animeyubi, miruro, animex, anilight, anipm
 * all do). Falls back to the first result if none match by anilist id.
 */
function pickBestMatch(
  results: UnifiedSearchResult[],
  anilistId: number
): UnifiedSearchResult | null {
  if (results.length === 0) return null;
  return (
    results.find((r) => r.anilistId === anilistId) ||
    results.find((r) => r.malId) || // any result with a mal id is likely the right one
    results[0]
  );
}

/**
 * Resolve a (possibly bare AniList) id to the provider's native id format.
 *
 * Behavior:
 *   - Non-`al:` ids are returned as-is (already provider-native).
 *   - `al:{id}:{slug}` ids are returned as-is (already in anilight format).
 *   - `al:{id}` on a native provider (miruro/animex/anilight) is returned as-is.
 *   - `al:{id}` on a non-native provider (animetsu/anikuro/animeyubi/anipm)
 *     triggers a title-search resolution via AniList + the provider's search.
 *
 * Returns the original id if resolution fails — the downstream provider
 * call will then likely return null/empty, which the API route surfaces as
 * a 404. The caller can also call `resolveIdVerbose` to inspect the
 * resolution metadata.
 *
 * Accepts a raw `string` for the provider id (validated internally with
 * `isProviderId`) so callers don't have to cast URL params.
 */
export async function resolveIdForProvider(
  providerId: string,
  id: string
): Promise<string> {
  const result = await resolveIdVerbose(providerId, id);
  return result?.nativeId ?? id;
}

/**
 * Same as `resolveIdForProvider` but returns full resolution metadata.
 * Used by /api/scrape/resolve for debugging / explicit lookups.
 */
export async function resolveIdVerbose(
  providerId: string,
  id: string
): Promise<ResolveResult | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  // Validate provider id — fall back to animetsu for unknown strings.
  const pid: ProviderId = isProviderId(providerId) ? providerId : "animetsu";

  // Non-al: id — already provider-native, pass through.
  if (!trimmed.startsWith("al:")) {
    return {
      nativeId: trimmed,
      anilistId: 0,
      provider: pid,
      strategy: "passthrough",
    };
  }

  // al:{id}:{slug} — already in anilight format, pass through.
  if (isAnilistIdWithSlug(trimmed)) {
    const alId = extractAnilistId(trimmed);
    return {
      nativeId: trimmed,
      anilistId: alId ?? 0,
      provider: pid,
      strategy: "passthrough",
    };
  }

  // Bare al:{id} on a native provider — pass through.
  if (providerAcceptsAnilistNative(pid) && isBareAnilistId(trimmed)) {
    const alId = extractAnilistId(trimmed);
    return {
      nativeId: trimmed,
      anilistId: alId ?? 0,
      provider: pid,
      strategy: "passthrough",
    };
  }

  // Bare al:{id} on a non-native provider — resolve via AniList title search.
  const anilistId = extractAnilistId(trimmed);
  if (!anilistId) return null;

  const cacheKey = `${pid}:al:${anilistId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) {
    return hit.v
      ? { ...hit.v, strategy: "cache-hit" as const }
      : null;
  }

  let result: ResolveResult | null = null;
  try {
    const media = await getAniListMedia(anilistId);
    if (media) {
      const candidates = candidateTitles(media);
      const provider = getProvider(pid);
      const triedTitles: string[] = [];

      for (const q of candidates) {
        triedTitles.push(q);
        let results: UnifiedSearchResult[] = [];
        try {
          results = await provider.search(q);
        } catch {
          continue;
        }
        if (results.length === 0) continue;

        const match = pickBestMatch(results, anilistId);
        if (match) {
          result = {
            nativeId: match.id,
            anilistId,
            provider: pid,
            matchedTitle:
              match.title?.preferred ||
              match.title?.english ||
              match.title?.romaji ||
              q,
            strategy: "title-search",
            triedTitles,
          };
          break;
        }
      }
    }
  } catch {
    // swallow — return null below
  }

  cache.set(cacheKey, { t: Date.now(), v: result });
  return result;
}

/**
 * Convenience: resolve an AniList id across ALL providers in parallel.
 * Used by /api/scrape/resolve when no `provider` param is supplied.
 * Returns the first provider that successfully resolves.
 */
export async function resolveAcrossAllProviders(
  anilistId: number
): Promise<Record<string, ResolveResult | null>> {
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
  const entries = await Promise.all(
    providerIds.map(async (pid) => {
      const r = await resolveIdVerbose(pid, `al:${anilistId}`).catch(() => null);
      return [pid, r] as const;
    })
  );
  return Object.fromEntries(entries);
}
