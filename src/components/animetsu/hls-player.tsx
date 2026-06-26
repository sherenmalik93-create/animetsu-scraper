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

interface HlsPlayerProps {
  masterUrl: string;
  qualities: Quality[];
  subtitles: Subtitle[];
  skips?: SkipMarkers;
  poster?: string;
  title?: string;
  onEnded?: () => void;
  className?: string;
}

/**
 * HLS video player built on top of hls.js.
 *
 * - Falls back to native HLS playback on Safari
 * - Quality switcher (auto + manual levels)
 * - Subtitle track selector (VTT)
 * - Intro/outro skip buttons when skip markers are available
 */
export function HlsPlayer({
  masterUrl,
  qualities,
  subtitles,
  skips,
  poster,
  title,
  onEnded,
  className,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [currentLevel, setCurrentLevel] = useState<number>(-1); // -1 = auto
  const [currentSub, setCurrentSub] = useState<string>("off");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipOutro, setShowSkipOutro] = useState(false);

  // (Re)initialise hls.js whenever the master URL changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Use a microtask to avoid the synchronous setState-in-effect lint rule
    // while still resetting the player state before init.
    queueMicrotask(() => {
      setError(null);
      setReady(false);
    });

    // Safari supports HLS natively
    if (video.canPlayType("application/vnd.apple.mpegurl") && !Hls.isSupported()) {
      video.src = masterUrl;
      const onLoaded = () => setReady(true);
      video.addEventListener("loadedmetadata", onLoaded);
      return () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeAttribute("src");
      };
    }

    if (!Hls.isSupported()) {
      queueMicrotask(() => setError("HLS is not supported in this browser."));
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
      xhrSetup: (xhr) => {
        // Add a crossOrigin-friendly flag — our proxy already sets ACAO: *
        xhr.withCredentials = false;
      },
    });
    hlsRef.current = hls;

    hls.loadSource(masterUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setReady(true);
      // Apply the user's chosen quality (or auto)
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
     
  }, [masterUrl]);

  // Quality switch
  useEffect(() => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = currentLevel;
    }
  }, [currentLevel]);

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
          {qualities.length > 0 && (
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
