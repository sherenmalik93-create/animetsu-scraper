/**
 * AniList GraphQL integration
 *
 * animetsu.live already exposes `anilist_id` on every anime, so we can hit
 * the official AniList GraphQL endpoint directly to enrich the UI with:
 *   - Character roster (with VA + image)
 *   - Studio list
 *   - Recommendations
 *   - Reviews
 *   - Trending / popularity stats
 *   - Trailer (YouTube id)
 *
 * All requests go through a small in-memory cache because AniList rate-limits
 * to ~90 req/min.
 */

const ANILIST_GRAPHQL = "https://graphql.anilist.co";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const cache = new Map<string, { t: number; v: unknown }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min — AniList data is fairly stable

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.v as T;
}

function cacheSet<T>(key: string, v: T): T {
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 500) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  return v;
}

export interface AniListCharacter {
  id: number;
  name: { full: string; native?: string };
  image?: string;
  role?: string;
  voiceActor?: { name: { full: string }; image?: string };
}

export interface AniListStudio {
  id: number;
  name: string;
  isAnimationStudio: boolean;
}

export interface AniListMedia {
  id: number;
  idMal?: number;
  title: { romaji?: string; english?: string; native?: string };
  /** Alternative titles — used by the universal AniList ID resolver to
   *  match anime across providers that don't natively index by AniList id. */
  synonyms?: string[];
  description?: string;
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  favourites?: number;
  trending?: number;
  episodes?: number;
  duration?: number;
  status?: string;
  season?: string;
  seasonYear?: number;
  format?: string;
  source?: string;
  countryOfOrigin?: string;
  genres?: string[];
  trailer?: { id: string; site: string; thumbnail?: string };
  coverImage?: { large?: string; color?: string };
  bannerImage?: string;
  nextAiringEpisode?: { airingAt: number; episode: number; timeUntilAiring: number };
  characters?: { nodes: AniListCharacter[] };
  studios?: { nodes: AniListStudio[] };
  recommendations?:
    | { nodes: { id: number; mediaRecommendation?: { id: number; title: { romaji?: string; english?: string }; coverImage?: { large?: string }; averageScore?: number } }[] };
}

export interface AniListReview {
  id: number;
  summary: string;
  rating: number;
  score: number;
  user: { name: string; avatar?: string };
  body?: string;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const cacheKey = `${query}::${JSON.stringify(variables)}`;
  const cached = cacheGet<T>(cacheKey);
  if (cached !== undefined) return cached;

  const res = await fetch(ANILIST_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": BROWSER_UA,
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 600 },
  });

  if (!res.ok) {
    throw new Error(`AniList returned ${res.status}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors && json.errors.length) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  return cacheSet(cacheKey, json.data as T);
}

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  synonyms
  description
  averageScore
  meanScore
  popularity
  favourites
  trending
  episodes
  duration
  status
  season
  seasonYear
  format
  source
  countryOfOrigin
  genres
  trailer { id site thumbnail }
  coverImage { large color }
  bannerImage
  nextAiringEpisode { airingAt episode timeUntilAiring }
  characters(perPage: 12, sort: ROLE) {
    nodes {
      id
      name { full native }
      image { large }
    }
  }
  studios(isMain: true) {
    nodes { id name isAnimationStudio }
  }
  recommendations(perPage: 6, sort: RATING_DESC) {
    nodes {
      id
      mediaRecommendation {
        id
        title { romaji english }
        coverImage { large }
        averageScore
      }
    }
  }
`;

const GET_MEDIA_BY_ID = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      ${MEDIA_FIELDS}
    }
  }
`;

const GET_MANGA_BY_ID = `
  query ($id: Int) {
    Media(id: $id, type: MANGA) {
      id
      idMal
      title { romaji english native }
      synonyms
      description
      averageScore
      meanScore
      popularity
      favourites
      trending
      chapters
      volumes
      status
      format
      source
      countryOfOrigin
      genres
      coverImage { large color }
      bannerImage
      characters(perPage: 12, sort: ROLE) {
        nodes {
          id
          name { full native }
        }
      }
      recommendations(perPage: 6, sort: RATING_DESC) {
        nodes {
          id
          mediaRecommendation {
            id
            title { romaji english }
            coverImage { large }
            averageScore
          }
        }
      }
    }
  }
`;

const SEARCH_MEDIA = `
  query ($search: String!, $perPage: Int) {
    Page(perPage: $perPage) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id
        idMal
        title { romaji english native }
        coverImage { large color }
        bannerImage
        averageScore
        popularity
        episodes
        format
        seasonYear
        status
        genres
      }
    }
  }
`;

const SEARCH_MANGA = `
  query ($search: String!, $perPage: Int) {
    Page(perPage: $perPage) {
      media(search: $search, type: MANGA, sort: SEARCH_MATCH) {
        id
        idMal
        title { romaji english native }
        coverImage { large color }
        bannerImage
        averageScore
        popularity
        chapters
        volumes
        format
        status
        genres
      }
    }
  }
`;

const GET_TRENDING = `
  query {
    Page(page: 1, perPage: 20) {
      media(type: ANIME, sort: TRENDING_DESC) {
        id
        title { romaji english native }
        coverImage { large color }
        averageScore
        episodes
        format
        seasonYear
      }
    }
  }
`;

export async function getAniListMedia(anilistId: number): Promise<AniListMedia | null> {
  try {
    const data = await gql<{ Media: AniListMedia }>(GET_MEDIA_BY_ID, { id: anilistId });
    return data.Media;
  } catch {
    return null;
  }
}

export async function searchAniList(
  search: string,
  type: "ANIME" | "MANGA" = "ANIME",
  perPage = 10
): Promise<AniListMedia[]> {
  if (!search.trim()) return [];
  try {
    const query = type === "MANGA" ? SEARCH_MANGA : SEARCH_MEDIA;
    const data = await gql<{ Page: { media: AniListMedia[] } }>(query, {
      search,
      perPage,
    });
    return data.Page.media;
  } catch {
    return [];
  }
}

export async function getAniListManga(anilistId: number): Promise<AniListMedia | null> {
  try {
    const data = await gql<{ Media: AniListMedia }>(GET_MANGA_BY_ID, { id: anilistId });
    return data.Media;
  } catch {
    return null;
  }
}

export async function getTrending(): Promise<AniListMedia[]> {
  try {
    const data = await gql<{ Page: { media: AniListMedia[] } }>(GET_TRENDING, {});
    return data.Page.media;
  } catch {
    return [];
  }
}

/**
 * Merge animetsu + AniList info into a single rich payload.
 * Animetsu is the source of truth for streaming; AniList fills in characters,
 * studios, recommendations, and trailer.
 */
export async function enrichWithAniList<T extends { anilist_id?: number }>(
  base: T
): Promise<{ base: T; anilist: AniListMedia | null }> {
  if (!base.anilist_id) return { base, anilist: null };
  const anilist = await getAniListMedia(base.anilist_id);
  return { base, anilist };
}
