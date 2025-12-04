import { useState, useRef, useEffect, useCallback } from "react";
import { SystemPreset, BodyTemplate } from "../types";
import { getSimulationKey, ensurePlanetForPayload } from "../utils/planetHelpers";
import { stopAll } from "../audio";

const defaultPreset: SystemPreset = {
  star: { massMs: 1.0 },
  planets: [],
  durationSec: 10,
  dtSec: 0.016,
};

interface UseSystemStateResult {
  system: SystemPreset;
  setSystem: React.Dispatch<React.SetStateAction<SystemPreset>>;
  buildSimulationPayload: (planetsOverride?: BodyTemplate[]) => any;
}

export const useSystemState = (): UseSystemStateResult => {
  const [system, setSystem] = useState<SystemPreset>(defaultPreset);

  const buildSimulationPayload = useCallback(
    (planetsOverride?: BodyTemplate[]) => ({
      star: { ...system.star },
      planets: (planetsOverride ?? system.planets).map((p) => ({ ...p })).map(ensurePlanetForPayload),
      durationSec: system.durationSec,
      dtSec: system.dtSec,
      musicMode: system.musicMode,
    }),
    [system]
  );

  return { system, setSystem, buildSimulationPayload };
};

interface UseAutoSimulationOptions {
  planets: BodyTemplate[];
  isDragging: boolean;
  buildSimulationPayload: (planetsOverride?: BodyTemplate[]) => any;
  runSimulation: (payload: any, requestId: number) => Promise<void>;
  computeRequestRef: React.MutableRefObject<number>;
  playStartRef: React.MutableRefObject<number | null>;
}

export const useAutoSimulation = ({
  planets,
  isDragging,
  buildSimulationPayload,
  runSimulation,
  computeRequestRef,
  playStartRef,
}: UseAutoSimulationOptions) => {
  const lastSimKeyRef = useRef<string>("");

  useEffect(() => {
    if (isDragging || !planets.length) {
      if (!planets.length) {
        computeRequestRef.current += 1;
        lastSimKeyRef.current = "";
        stopAll();
        playStartRef.current = null;
      }
      return;
    }

    const simKey = getSimulationKey(planets);
    if (simKey === lastSimKeyRef.current) return;
    lastSimKeyRef.current = simKey;

    runSimulation(buildSimulationPayload(), ++computeRequestRef.current);
  }, [planets, buildSimulationPayload, runSimulation, isDragging]);
};
