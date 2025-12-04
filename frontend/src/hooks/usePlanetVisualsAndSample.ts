import { useMemo } from "react";
import { ComputeResponse } from "../types";

const DEFAULT_PLANET_COLORS = {
  rocky: "#a0a0a0",
  gas: "#4af4ff",
  star: "#ffdd44",
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
    const metadata = data?.planetMetadata ?? [];

    for (const meta of metadata) {
      map[meta.name] = {
        color:
          meta.color ??
          DEFAULT_PLANET_COLORS[meta.kind as keyof typeof DEFAULT_PLANET_COLORS] ??
          DEFAULT_PLANET_COLORS.rocky,
        radius: meta.radius ?? 6,
        kind: meta.kind,
      };
    }

    for (const p of planets) {
      map[p.name] = {
        color:
          p.color ??
          map[p.name]?.color ??
          DEFAULT_PLANET_COLORS[p.kind as keyof typeof DEFAULT_PLANET_COLORS] ??
          DEFAULT_PLANET_COLORS.rocky,
        radius: p.radius ?? map[p.name]?.radius ?? 6,
        kind: p.kind,
      };
    }
    return map;
  }, [planets, data]);

  const currentSample = useMemo(() => {
    if (!data || !hasSimData) return null;
    const samples = data.samples ?? [];
    const metadata = data.planetMetadata ?? [];
    const dt = data.meta?.dtSec ?? dtSec;
    if (samples.length === 0 || !Number.isFinite(dt) || dt <= 0) return null;
    const t = Math.min(playhead, samples.length * dt - dt);
    const idx = Math.min(samples.length - 1, Math.max(0, Math.floor(t / dt)));
    const sample = samples[idx];
    if (!sample) return null;

    const planetsWithMeta = metadata.map((meta, metaIdx) => {
      const pos = sample.positions?.[metaIdx] ?? [0, 0];
      return {
        name: meta.name,
        kind: meta.kind,
        color: meta.color,
        radius: meta.radius ?? 6,
        x: pos[0],
        y: pos[1],
      };
    });

    return { t: sample.t, planets: planetsWithMeta };
  }, [data, hasSimData, dtSec, playhead]);

  return { planetVisuals, currentSample };
};
