"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface Quality {
  label: string;
  resolution: string;
  url: string;
}

export interface Subtitle {
  lang: string;
  url: string;
}

export interface SkipMarkers {
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

export interface StreamSource {
  url: string;
  type: "hls" | "mp4" | "master";
  quality?: string;
  isMaster?: boolean;
  originalUrl?: string;
}

interface MediaPlayerProps {
  /** The primary source to play (HLS master or MP4) */
  source?: StreamSource;
  /** Alternative quality levels (for HLS) */
  qualities?: Quality[];
  /** Subtitle tracks */
  subtitles?: Subtitle[];
  skips?: SkipMarkers;
  poster?: string;
  title?: string;
  onEnded?: () => void;
  className?: string;
}

/**
 * Universal media player — handles both HLS (m3u8) and MP4 sources.
 *
 * - HLS: uses hls.js with quality switcher (auto + manual levels)
 * - MP4: native HTML5 video with quality switcher (reloads source)
 * - Falls back to native HLS playback on Safari
 * - Subtitle track selector (VTT)
 * - Intro/outro skip buttons when skip markers are available
 */
export function MediaPlayer({
  source,
  qualities = [],
  subtitles = [],
  skips,
  poster,
  title,
  onEnded,
  className,
}: MediaPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 = auto (HLS)
  const [currentSub, setCurrentSub] = useState<string>("off");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);
  // For MP4: index of the chosen quality in `qualities`
  const [mp4QualityIdx, setMp4QualityIdx] = useState<number>(0);

  const isHls = source?.type === "hls" || source?.type === "master";
  const isMp4 = source?.type === "mp4";
  const masterUrl = source?.url || "";

  // (Re)initialise the player whenever the source URL changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !masterUrl) return;

    queueMicrotask(() => {
      setError(null);
      setReady(false);
    });

    // MP4 — native playback
    if (isMp4) {
      video.src = masterUrl;
      const onLoaded = () => setReady(true);
      video.addEventListener("loadedmetadata", onLoaded);
      return () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeAttribute("src");
        video.load();
      };
    }

    // HLS — Safari native
    if (video.canPlayType("application/vnd.apple.mpegurl") && !Hls.isSupported()) {
      video.src = masterUrl;
      const onLoaded = () => setReady(true);
      video.addEventListener("loadedmetadata", onLoaded);
      return () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeAttribute("src");
      };
    }

    // HLS — hls.js
    if (!Hls.isSupported()) {
      queueMicrotask(() => setError("HLS is not supported in this browser."));
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
      xhrSetup: (xhr) => {
        xhr.withCredentials = false;
      },
    });
    hlsRef.current = hls;

    hls.loadSource(masterUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setReady(true);
      hls.currentLevel = currentLevel;
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            setError(`Playback error: ${data.details}`);
            hls.destroy();
            break;
        }
      }
    });

    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
     
  }, [masterUrl, isMp4]);

  // Quality switch for HLS
  useEffect(() => {
    if (hlsRef.current && isHls) {
      hlsRef.current.currentLevel = currentLevel;
    }
  }, [currentLevel, isHls]);

  // Quality switch for MP4 — reload source at the new URL
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isMp4 || qualities.length === 0) return;
    const q = qualities[mp4QualityIdx];
    if (!q || video.src === q.url) return;
    const t = video.currentTime;
    const wasPaused = video.paused;
    video.src = q.url;
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = t;
      if (!wasPaused) video.play().catch(() => {});
    }, { once: true });
  }, [mp4QualityIdx, isMp4, qualities]);

  // Subtitle track switch
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = tracks[i].id === currentSub ? "showing" : "disabled";
    }
  }, [currentSub, subtitles]);

  // Skip-marker UI
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !skips) return;
    const onTime = () => {
      const t = video.currentTime;
      setShowSkipIntro(
        !!skips.intro && t >= skips.intro.start && t < skips.intro.end - 1
      );
      setShowSkipOutro(
        !!skips.outro && t >= skips.outro.start && t < skips.outro.end - 1
      );
    };
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [skips]);

  const skip = (target: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = target;
  };

  if (!source) {
    return (
      <div className={cn("flex aspect-video w-full items-center justify-center rounded-xl bg-black text-sm text-zinc-500", className)}>
        No stream available.
      </div>
    );
  }

  return (
    <div className={cn("relative w-full overflow-hidden rounded-xl bg-black", className)}>
      <video
        ref={videoRef}
        poster={poster}
        controls
        playsInline
        crossOrigin="anonymous"
        onEnded={onEnded}
        className="aspect-video w-full bg-black"
      >
        {subtitles.map((s) => (
          <track
            key={s.url}
            id={s.url}
            kind="subtitles"
            src={s.url}
            srcLang={s.lang.slice(0, 2).toLowerCase()}
            label={s.lang}
            default={currentSub === s.url}
          />
        ))}
      </video>

      {/* Top overlay — title + quality selector */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-3">
        <div className="pointer-events-auto truncate text-sm font-medium text-white">
          {title}
        </div>
        <div className="pointer-events-auto flex gap-2">
          {/* HLS quality selector */}
          {isHls && qualities.length > 0 && (
            <Select
              value={String(currentLevel)}
              onValueChange={(v) => setCurrentLevel(Number(v))}
            >
              <SelectTrigger className="h-8 w-28 border-white/20 bg-black/60 text-xs text-white">
                <SelectValue placeholder="Quality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">Auto</SelectItem>
                {qualities.map((q, i) => (
                  <SelectItem key={q.url} value={String(i)}>
                    {q.label} ({q.resolution})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* MP4 quality selector */}
          {isMp4 && qualities.length > 1 && (
            <Select
              value={String(mp4QualityIdx)}
              onValueChange={(v) => setMp4QualityIdx(Number(v))}
            >
              <SelectTrigger className="h-8 w-28 border-white/20 bg-black/60 text-xs text-white">
                <SelectValue placeholder="Quality" />
              </SelectTrigger>
              <SelectContent>
                {qualities.map((q, i) => (
                  <SelectItem key={q.url} value={String(i)}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Subtitle selector */}
          {subtitles.length > 0 && (
            <Select value={currentSub} onValueChange={setCurrentSub}>
              <SelectTrigger className="h-8 w-28 border-white/20 bg-black/60 text-xs text-white">
                <SelectValue placeholder="Subs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off</SelectItem>
                {subtitles.map((s) => (
                  <SelectItem key={s.url} value={s.url}>
                    {s.lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Skip buttons */}
      {showSkipIntro && skips?.intro && (
        <Button
          onClick={() => skip(skips.intro!.end)}
          className="absolute bottom-20 right-4 z-10 h-9"
          size="sm"
        >
          Skip Intro
        </Button>
      )}
      {showSkipOutro && skips?.outro && (
        <Button
          onClick={() => skip(skips.outro!.end)}
          className="absolute bottom-20 right-4 z-10 h-9"
          size="sm"
        >
          Skip Outro
        </Button>
      )}

      {/* Loading / error overlay */}
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-sm text-white/70">
          Loading stream…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-4 text-center text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
