import { useMemo } from "react";
import { ComputeResponse } from "../types";

const DEFAULT_PLANET_COLORS = {
  rocky: "#a0a0a0",
  gas: "#4af4ff",
};

interface Planet {
  name: string;
  kind: string;
  color?: string;
  radius?: number;
}

export const usePlanetVisualsAndSample = (
  planets: Planet[],
  data: ComputeResponse | null,
  hasSimData: boolean,
  playhead: number,
  dtSec: number
) => {
  const planetVisuals = useMemo(() => {
    const map: Record<string, { color: string; radius: number; kind: string }> = {};
    for (const p of planets) {
      map[p.name] = {
        color: p.color ?? DEFAULT_PLANET_COLORS[p.kind as keyof typeof DEFAULT_PLANET_COLORS],
        radius: p.radius ?? 6,
        kind: p.kind,
      };
    }
    return map;
  }, [planets]);

  const currentSample = useMemo(() => {
    if (!data || !hasSimData) return null;
    const samples = data.samples ?? [];
    const dt = dtSec;
    if (samples.length === 0 || !Number.isFinite(dt) || dt <= 0) return null;
    const t = Math.min(playhead, samples.length * dt - dt);
    const idx = Math.min(samples.length - 1, Math.max(0, Math.floor(t / dt)));
    return samples[idx] ?? null;
  }, [data, hasSimData, dtSec, playhead]);

  return { planetVisuals, currentSample };
};
