import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  url: string;
}

const BAR_COUNT = 36;

export function AudioMessage({ url }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<1 | 1.5 | 2>(1);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;
    const onMeta = () => setDuration(audio.duration || 0);
    const onTime = () => setProgress(audio.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audioRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // deterministic pseudo-waveform from url hash
  const bars = useMemo(() => {
    let h = 0;
    for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) >>> 0;
    return Array.from({ length: BAR_COUNT }, (_, i) => {
      h = (h * 1664525 + 1013904223) >>> 0;
      return 0.25 + ((h >>> (i % 24)) & 0xff) / 320;
    });
  }, [url]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      void a.play();
      setPlaying(true);
    }
  };

  const cycleSpeed = () => {
    setSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1));
  };

  const pct = duration > 0 ? progress / duration : 0;
  const active = Math.round(pct * BAR_COUNT);
  const remaining = duration > 0 ? Math.max(duration - progress, 0) : 0;

  return (
    <div className="flex min-w-[260px] items-center gap-3">
      <button
        onClick={toggle}
        aria-label={playing ? "Pausar" : "Reproduzir"}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-current text-primary-foreground shadow-sm transition-transform hover:scale-105"
      >
        {playing ? (
          <Pause className="h-4 w-4 text-[color:var(--color-background)]" />
        ) : (
          <Play className="h-4 w-4 -translate-x-[1px] text-[color:var(--color-background)]" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            if (audioRef.current && duration > 0) {
              audioRef.current.currentTime = ratio * duration;
              setProgress(ratio * duration);
            }
          }}
          className="flex h-8 items-end gap-[2px]"
          aria-label="Barra de progresso"
        >
          {bars.map((h, i) => (
            <span
              key={i}
              className={cn("waveform-bar", i < active && "waveform-bar-active")}
              style={{ height: `${Math.max(4, h * 28)}px` }}
            />
          ))}
        </button>
        <div className="flex items-center justify-between text-[10px] font-medium tabular-nums opacity-70">
          <span>{formatDuration(playing || progress > 0 ? progress : duration)}</span>
          <span>{playing && remaining > 0 ? `-${formatDuration(remaining)}` : ""}</span>
        </div>
      </div>

      <button
        onClick={cycleSpeed}
        className="grid h-7 min-w-9 shrink-0 place-items-center rounded-full border border-current/25 px-1.5 text-[10px] font-semibold tabular-nums opacity-80 transition-opacity hover:opacity-100"
        aria-label="Velocidade de reprodução"
      >
        {speed}x
      </button>
    </div>
  );
}
