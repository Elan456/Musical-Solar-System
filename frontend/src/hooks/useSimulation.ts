import { useState, useEffect, useRef, useCallback } from "react";
import { SystemPreset, ComputeResponse, BodyTemplate } from "../types";
import { stopAll } from "../audio";
import { ensurePlanetForPayload } from "../utils/planetHelpers";

const API = "http://localhost:8000/api";

interface UseSimulationResult {
  data: ComputeResponse | null;
  isComputing: boolean;
  error: string | null;
  runSimulation: (payload: SystemPreset, requestId: number) => Promise<void>;
  computeRequestRef: React.MutableRefObject<number>;
}

export const useSimulation = (): UseSimulationResult => {
  const [data, setData] = useState<ComputeResponse | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const computeRequestRef = useRef(0);

  const runSimulation = useCallback(async (payload: SystemPreset, requestId: number) => {
    setIsComputing(true);
    setError(null);
    stopAll();

    try {
      const res = await fetch(`${API}/compute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Server responded with ${res.status}`);

      const json: ComputeResponse = await res.json();
      if (requestId !== computeRequestRef.current) return;

      setData(json);
    } catch (err: any) {
      console.error(err);
      if (requestId !== computeRequestRef.current) return;
      setError(err?.message ?? "Failed to run simulation");
      setData(null);
    } finally {
      if (requestId === computeRequestRef.current) setIsComputing(false);
    }
  }, []);

  return {
    data,
    isComputing,
    error,
    runSimulation,
    computeRequestRef,
  };
};
