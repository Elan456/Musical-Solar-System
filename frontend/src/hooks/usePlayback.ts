import { useState, useRef, useEffect, useCallback } from "react";
import { ComputeResponse } from "../types";
import { stopAll, playEvents } from "../audio";

interface UsePlaybackResult {
  playing: boolean;
  playhead: number;
  blinkingPlanets: Set<string>;
  handlePlay: () => void;
  handlePause: () => void;
  handleReset: () => void;
  handleNoteBlink: (planetName: string) => void;
  playStartRef: React.MutableRefObject<number | null>;
  loopDurationRef: React.MutableRefObject<number>;
}

export const usePlayback = (
  data: ComputeResponse | null,
  hasSimData: boolean,
  isComputing: boolean,
  dtSec: number
): UsePlaybackResult => {
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [blinkingPlanets, setBlinkingPlanets] = useState<Set<string>>(new Set());

  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<number | null>(null);
  const audioLoopActiveRef = useRef(false);
  const playingRef = useRef(playing);
  const loopDurationRef = useRef<number>(10);

  const handleNoteBlink = useCallback((planetName: string) => {
    setBlinkingPlanets((prev) => new Set(prev).add(planetName));
    setTimeout(() => {
      setBlinkingPlanets((prev) => {
        const next = new Set(prev);
        next.delete(planetName);
        return next;
      });
    }, 150);
  }, []);

  const startAudioLoop = useCallback(() => {
    if (!data?.events?.length) return;
    audioLoopActiveRef.current = true;
    playStartRef.current = performance.now();
    setPlayhead(0);

    playEvents(data.events, loopDurationRef.current, handleNoteBlink, () => {
      if (audioLoopActiveRef.current && playingRef.current) {
        startAudioLoop();
      }
    });
  }, [data, handleNoteBlink]);

  useEffect(() => {
    playingRef.current = playing;
    if (!playing) audioLoopActiveRef.current = false;
  }, [playing]);

  const handlePlay = useCallback(() => {
    if (!data || isComputing || !hasSimData) return;
    setPlaying(true);
    startAudioLoop();
  }, [data, isComputing, hasSimData, startAudioLoop]);

  const handlePause = useCallback(() => {
    audioLoopActiveRef.current = false;
    playingRef.current = false;
    setPlaying(false);
    stopAll();
  }, []);

  const handleReset = useCallback(() => {
    audioLoopActiveRef.current = false;
    playingRef.current = false;
    setPlaying(false);
    stopAll();
    setPlayhead(0);
    playStartRef.current = null;
  }, []);

  useEffect(() => {
    if (!playing || !data || !hasSimData) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const totalDuration = loopDurationRef.current;

    const tick = (now: number) => {
      if (!playStartRef.current) playStartRef.current = now;
      const elapsedSec = (now - playStartRef.current) / 1000;
      setPlayhead(Math.min(elapsedSec, totalDuration));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, data, hasSimData]);

  useEffect(() => {
    if (data?.samples) {
      const effectiveDt = data.meta?.dtSec ?? dtSec;
      loopDurationRef.current = Math.max(data.samples.length * effectiveDt, 10);
    }
  }, [data, dtSec]);

  return {
    playing,
    playhead,
    blinkingPlanets,
    handlePlay,
    handlePause,
    handleReset,
    handleNoteBlink,
    playStartRef,
    loopDurationRef,
  };
};
