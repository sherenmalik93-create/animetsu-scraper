/**
 * Animetsu.live scraper — type definitions
 *
 * These types mirror the JSON shapes returned by the upstream
 * `/v2/api/anime/*` endpoints. They are intentionally permissive
 * (every field optional) so a change upstream never breaks the build,
 * but the fields the UI actually relies on are typed explicitly.
 */

export type SourceType = "sub" | "dub";

export interface AnimeTitle {
  romaji?: string;
  english?: string;
  native?: string;
}

export interface CoverImage {
  large?: string;
  medium?: string;
  small?: string;
  color?: string;
}

export interface AiringSchedule {
  airing_at?: number;
  ep_num?: number;
  time_left?: number;
}

export interface SearchResult {
  id: string;
  type?: string;
  title: AnimeTitle;
  status?: string;
  is_adult?: boolean;
  cover_image?: CoverImage;
  banner?: string;
  description?: string;
  total_eps?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  year?: number;
  format?: string;
  duration?: number;
  genres?: string[];
  average_score?: number;
  trailer?: string;
  season?: string;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface AnimeInfo extends SearchResult {
  anilist_id?: number;
  mal_id?: number;
  color?: string;
  clear_logo?: string;
  country?: string;
  source?: string;
  hashtag?: string;
  synonyms?: string[];
  tags?: string[];
  next_airing_ep?: AiringSchedule;
  studios?: unknown;
  characters?: unknown;
  relations?: unknown;
  recommendations?: unknown;
}

export interface Episode {
  ep_num: number;
  dislikes?: number;
  likes?: number;
  views?: number;
  aired_at?: string;
  desc?: string;
  img?: string;
  name?: string;
  is_filler?: boolean;
  id: string;
}

export type EpisodeList = Episode[];

export interface ServerInfo {
  id: string;
  default?: boolean;
  tip?: string;
}

export type ServerList = ServerInfo[];

export interface StreamSource {
  url: string;
  quality?: string;
  type?: string;
  need_proxy?: boolean;
  old_hls?: boolean;
}

export interface SubtitleTrack {
  url: string;
  lang?: string;
}

export interface SkipMarkers {
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

export interface SourcesResponse {
  sources: StreamSource[];
  subs?: SubtitleTrack[];
  skips?: SkipMarkers;
  server?: string;
}

export interface ResolvedSource {
  /** Master m3u8 URL ready for an HLS player */
  masterUrl: string;
  /** Available quality levels parsed from the master playlist */
  qualities: { label: string; bandwidth: number; resolution: string; url: string }[];
  /** Subtitle tracks (URLs rewritten through our proxy when needed) */
  subtitles: { url: string; lang: string }[];
  /** Skip markers (intro/outro) */
  skips: SkipMarkers;
  /** Original server id (kite, dio, sage, meg) */
  server: string;
  /** Whether the stream requires our CORS proxy */
  needProxy: boolean;
}
