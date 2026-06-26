/**
 * Provider abstraction
 *
 * A "provider" is a backend that knows how to search an anime catalog,
 * fetch an episode list, and resolve a playable stream URL for a given
 * episode. The frontend doesn't care whether the underlying site is
 * animetsu.live, anikuro.ru, or anything else — it just calls the
 * provider methods through the unified `Provider` interface.
 *
 * To add a new provider:
 *   1. Implement the `Provider` interface in `src/lib/providers/<name>.ts`
 *   2. Register it in `src/lib/providers/index.ts`
 *   3. Done — the UI and API routes pick it up automatically.
 */

export type ProviderId = "animetsu" | "anikuro";

export interface ProviderMeta {
  id: ProviderId;
  /** Display name shown in the UI */
  label: string;
  /** Short tagline */
  description: string;
  /** Accent color (Tailwind class) */
  accent: string;
  /** Whether this provider supports dub streams */
  supportsDub: boolean;
  /** Default streaming server (each provider has its own server list) */
  defaultServer: string;
}

/* ------------------------------------------------------------------ */
/*  Unified data types — every provider maps to these                  */
/* ------------------------------------------------------------------ */

export interface UnifiedTitle {
  romaji?: string;
  english?: string;
  native?: string;
  /** Whatever the provider considers the user-preferred title */
  preferred?: string;
}

export interface UnifiedImage {
  cover?: string;
  banner?: string;
  large?: string;
  medium?: string;
  small?: string;
  color?: string;
}

export interface UnifiedSearchResult {
  /** Provider-specific id (used in subsequent calls) */
  id: string;
  /** AniList id if known (lets us enrich with AniList metadata) */
  anilistId?: number;
  malId?: number;
  title: UnifiedTitle;
  coverImage?: UnifiedImage;
  banner?: string;
  description?: string;
  status?: string;
  year?: number;
  format?: string;
  genres?: string[];
  averageScore?: number;
  totalEpisodes?: number | null;
  isAdult?: boolean;
  duration?: number;
  season?: string;
}

export interface UnifiedEpisode {
  /** Episode number (1-indexed) */
  number: number;
  /** Display label (e.g. "1", "1.5", "OVA 1") */
  displayNumber?: string;
  /** Internal id used to fetch sources (provider-specific) */
  sourceId: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  image?: string;
  airedAt?: string;
  duration?: number;
  filler?: boolean;
  /** Available audio variants — ["sub"] or ["sub","dub"] */
  variants?: string[];
}

export interface UnifiedServer {
  /** Provider-specific server id */
  id: string;
  label?: string;
  description?: string;
  default?: boolean;
}

export interface UnifiedStreamSource {
  /** Proxy-ready URL — drop straight into an HLS player or <video> tag */
  url: string;
  /** "hls" | "mp4" | "master" */
  type: "hls" | "mp4" | "master";
  quality?: string;
  /** Whether the stream is a master playlist with multiple qualities */
  isMaster?: boolean;
  /** Original upstream URL (for debugging) */
  originalUrl?: string;
  /** Required Referer header when fetching the upstream directly */
  upstreamReferer?: string;
}

export interface UnifiedSubtitle {
  url: string;
  lang: string;
}

export interface UnifiedSkipMarkers {
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

export interface UnifiedSources {
  sources: UnifiedStreamSource[];
  subtitles: UnifiedSubtitle[];
  skips?: UnifiedSkipMarkers;
  server: string;
  /** The provider id that produced these sources */
  provider: ProviderId;
  /** Quality levels parsed from the master playlist (if HLS) */
  qualities?: { label: string; resolution: string; url: string }[];
}

/* ------------------------------------------------------------------ */
/*  The interface every provider must implement                        */
/* ------------------------------------------------------------------ */

export interface Provider {
  readonly meta: ProviderMeta;

  search(query: string): Promise<UnifiedSearchResult[]>;
  getInfo(id: string): Promise<UnifiedSearchResult | null>;
  getEpisodes(id: string): Promise<UnifiedEpisode[]>;
  getServers?(id: string, epNum: number): Promise<UnifiedServer[]>;
  getSources(opts: {
    id: string;
    epNum: number;
    server?: string;
    sourceType?: "sub" | "dub";
  }): Promise<UnifiedSources>;
}
