/**
 * Animetsu provider
 *
 * Wraps the existing `src/lib/animetsu/client.ts` so it conforms to the
 * unified `Provider` interface. The actual scraping logic lives in the
 * animetsu module — this file is just an adapter.
 */

import {
  searchAnime,
  getAnimeInfo,
  getEpisodes,
  getServers,
  resolveSources,
  resolveStreamUrl,
  parseMasterPlaylist,
  ANIMETSU_API_BASE,
  SWIFTSTREAM_PROXY,
} from "@/lib/animetsu/client";
import type {
  Provider,
  UnifiedSearchResult,
  UnifiedEpisode,
  UnifiedServer,
  UnifiedSources,
  UnifiedStreamSource,
} from "./types";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const animetsuProvider: Provider = {
  meta: {
    id: "animetsu",
    label: "Animetsu",
    description: "Soft sub · Multi quality · Cloudflare-fronted",
    accent: "from-rose-500 to-orange-500",
    supportsDub: true,
    defaultServer: "kite",
  },

  async search(query: string): Promise<UnifiedSearchResult[]> {
    if (!query.trim()) return [];
    const data = await searchAnime({ query });
    return (data.results || []).map((r) => ({
      id: r.id,
      anilistId: undefined, // animetsu doesn't expose this in search results
      title: {
        romaji: r.title?.romaji,
        english: r.title?.english,
        native: r.title?.native,
      },
      coverImage: {
        large: r.cover_image?.large,
        medium: r.cover_image?.medium,
        small: r.cover_image?.small,
        color: r.cover_image?.color,
      },
      banner: r.banner,
      description: r.description,
      status: r.status,
      year: r.year,
      format: r.format,
      genres: r.genres,
      averageScore: r.average_score,
      totalEpisodes: r.total_eps,
      isAdult: r.is_adult,
      duration: r.duration,
      season: r.season,
    }));
  },

  async getInfo(id: string): Promise<UnifiedSearchResult | null> {
    const info = await getAnimeInfo(id);
    return {
      id: info.id,
      anilistId: info.anilist_id,
      malId: info.mal_id,
      title: {
        romaji: info.title?.romaji,
        english: info.title?.english,
        native: info.title?.native,
      },
      coverImage: {
        large: info.cover_image?.large,
        medium: info.cover_image?.medium,
        color: info.cover_image?.color,
      },
      banner: info.banner,
      description: info.description,
      status: info.status,
      year: info.year,
      format: info.format,
      genres: info.genres,
      averageScore: info.average_score,
      totalEpisodes: info.total_eps,
      isAdult: info.is_adult,
      duration: info.duration,
      season: info.season,
    };
  },

  async getEpisodes(id: string): Promise<UnifiedEpisode[]> {
    const eps = await getEpisodes(id);
    return eps.map((e) => ({
      number: e.ep_num,
      displayNumber: String(e.ep_num),
      sourceId: id, // animetsu uses the anime id as the watch id
      title: e.name,
      description: e.desc,
      thumbnail: e.img,
      airedAt: e.aired_at,
      filler: e.is_filler,
      variants: ["sub", "dub"],
    }));
  },

  async getServers(id: string, epNum: number): Promise<UnifiedServer[]> {
    const servers = await getServers(id, epNum);
    return servers.map((s) => ({
      id: s.id,
      label: s.id,
      description: s.tip,
      default: s.default,
    }));
  },

  async getSources(opts): Promise<UnifiedSources> {
    const { id, epNum, server = "kite", sourceType = "sub" } = opts;
    const resolved = await resolveSources({
      watchId: id,
      epNum,
      server,
      sourceType,
    });

    const masterUrl = resolved.masterUrl;
    // Wrap master URL through our CORS proxy
    const proxiedMaster = `/api/proxy/m3u8?url=${encodeURIComponent(masterUrl)}`;

    const qualities = (resolved.qualities || []).map((q) => ({
      label: q.label,
      resolution: q.resolution,
      url: `/api/proxy/m3u8?url=${encodeURIComponent(q.url)}`,
    }));

    const sources: UnifiedStreamSource[] = [
      {
        url: proxiedMaster,
        type: "master",
        quality: "auto",
        isMaster: true,
        originalUrl: masterUrl,
      },
      ...qualities.map((q) => ({
        url: q.url,
        type: "hls" as const,
        quality: q.label,
        originalUrl: q.url,
      })),
    ];

    const subtitles = (resolved.subtitles || []).map((s) => ({
      url: `/api/proxy/m3u8?format=vtt&url=${encodeURIComponent(s.url)}`,
      lang: s.lang || "Unknown",
    }));

    return {
      sources,
      subtitles,
      skips: resolved.skips,
      server: resolved.server,
      provider: "animetsu",
      qualities,
    };
  },
};

/** Exposed for the anikuro provider to reuse when proxying m3u8 streams. */
export const _internal = {
  BROWSER_UA,
  ANIMETSU_API_BASE,
  SWIFTSTREAM_PROXY,
  resolveStreamUrl,
  parseMasterPlaylist,
};
