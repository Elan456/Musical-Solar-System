import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  SystemPreset,
  ComputeResponse,
  Planet,
  BodyTemplate,
  CustomBodyConfig,
} from "./types";
import { stopAll } from "./audio";
import CustomBodyPanel from "./components/CustomBodyPanel";

const API = "http://localhost:8000/api";

const defaultPreset: SystemPreset = {
  star: { massMs: 1.0 },
  planets: [],
  durationSec: 30,
  dtSec: 0.016,
  musicMode: "per_orbit_note",
};

type PlaybackConfig = {
  durationSec: number;
  dtSec: number;
};

const App: React.FC = () => {
  const [system, setSystem] = useState<SystemPreset>(defaultPreset);
  const [data, setData] = useState<ComputeResponse | null>(null);
  const [playbackConfig, setPlaybackConfig] = useState<PlaybackConfig | null>(
    null
  );
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customBody, setCustomBody] = useState<CustomBodyConfig>({
    kind: "rocky",
    color: "#ffffff",
    radius: 6,
  });
  const [placementMode, setPlacementMode] = useState(false);
  const [pendingPlanet, setPendingPlanet] = useState<BodyTemplate | null>(null);
  const [trajectory, setTrajectory] = useState<{
    planetName: string;
    points: { x: number; y: number }[];
  } | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<number | null>(null);
  const previewRequestRef = useRef(0);
  const previewDebounceRef = useRef<number | null>(null);
  const computeRequestRef = useRef(0);

  const hasSimData =
    !!data && Array.isArray((data as any).samples) && (data as any).samples.length > 0;

  const makeUniqueName = useCallback(
    (base: string, existingList?: BodyTemplate[]) => {
      const sanitized = base.trim() || "Planet";
      const source = existingList ?? system.planets;
      const existing = new Set(source.map((p) => p.name));
      if (!existing.has(sanitized)) return sanitized;
      let idx = 2;
      let candidate = `${sanitized} ${idx}`;
      while (existing.has(candidate)) {
        idx += 1;
        candidate = `${sanitized} ${idx}`;
      }
      return candidate;
    },
    [system.planets]
  );

  const removePlanet = useCallback((index: number) => {
    setSystem((prev) => ({
      ...prev,
      planets: prev.planets.filter((_, i) => i !== index),
    }));
  }, []);

  const clearPreview = useCallback(() => {
    setPendingPlanet(null);
    setTrajectory(null);
    setIsDragging(false);
    previewRequestRef.current += 1;
    setPredicting(false);
    if (previewDebounceRef.current) {
      window.clearTimeout(previewDebounceRef.current);
      previewDebounceRef.current = null;
    }
  }, []);

  const handlePlacementToggle = useCallback(() => {
    setPlacementMode((prev) => {
      const next = !prev;
      if (!next) clearPreview();
      return next;
    });
  }, [clearPreview]);

  const confirmCustomBody = useCallback(() => {
    if (!pendingPlanet) return;
    setSystem((prev) => ({
      ...prev,
      planets: [
        ...prev.planets,
        {
          ...pendingPlanet,
          name: makeUniqueName(pendingPlanet.name, prev.planets),
        },
      ],
    }));
    clearPreview();
    setPlacementMode(false);
  }, [pendingPlanet, clearPreview, makeUniqueName]);

  const computeMassFromConfig = useCallback((cfg: CustomBodyConfig) => {
    const base = Math.max(cfg.radius, 1);
    const mass = cfg.kind === "gas" ? base * 0.006 : base * 0.003;
    return parseFloat(mass.toFixed(3));
  }, []);

  const buildSimulationPayload = useCallback(
    (planetsOverride?: BodyTemplate[]) => {
      const clonePlanets = (planetsOverride ?? system.planets).map((p) => ({ ...p }));
      return {
        star: { ...system.star },
        planets: clonePlanets,
        durationSec: system.durationSec,
        dtSec: system.dtSec,
        musicMode: system.musicMode,
      };
    },
    [system.star, system.planets, system.durationSec, system.dtSec, system.musicMode]
  );

  const fetchTrajectoryPreview = useCallback(
    async (planet: BodyTemplate) => {
      const requestId = ++previewRequestRef.current;
      setPredicting(true);
      setTrajectory(null);
      try {
        const payload = buildSimulationPayload([...system.planets, planet]);
        const res = await fetch(`${API}/compute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          throw new Error(`Server responded with ${res.status}`);
        }
        const json: ComputeResponse = await res.json();
        const points =
          json.samples
            ?.map((sample) =>
              sample.planets.find((p: Planet) => p.name === planet.name)
            )
            .filter(Boolean)
            .map((p: Planet) => ({ x: p.x, y: p.y })) ?? [];
        if (previewRequestRef.current === requestId) {
          setTrajectory({ planetName: planet.name, points });
        }
      } catch (err) {
        console.error("Failed to predict trajectory", err);
        if (previewRequestRef.current === requestId) {
          setTrajectory(null);
        }
      } finally {
        if (previewRequestRef.current === requestId) {
          setPredicting(false);
        }
      }
    },
    [system, buildSimulationPayload]
  );

  useEffect(() => {
    if (!pendingPlanet) return;
    if (previewDebounceRef.current) {
      window.clearTimeout(previewDebounceRef.current);
      previewDebounceRef.current = null;
    }
    const handle = window.setTimeout(() => {
      fetchTrajectoryPreview(pendingPlanet);
      previewDebounceRef.current = null;
    }, 200);
    previewDebounceRef.current = handle;
    return () => {
      if (previewDebounceRef.current) {
        window.clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = null;
      }
    };
  }, [pendingPlanet, fetchTrajectoryPreview]);

  useEffect(() => {
    if (!pendingPlanet) return;
    setPendingPlanet((prev) => {
      if (!prev) return prev;
      const mass = computeMassFromConfig(customBody);
      if (
        prev.kind === customBody.kind &&
        prev.color === customBody.color &&
        prev.radius === customBody.radius &&
        prev.mass === mass
      ) {
        return prev;
      }
      return {
        ...prev,
        kind: customBody.kind,
        color: customBody.color,
        radius: customBody.radius,
        mass,
      };
    });
  }, [customBody, computeMassFromConfig]);

  const runSimulation = useCallback(
    async (payload: SystemPreset, requestId: number) => {
      setIsComputing(true);
      setError(null);
      setPlaying(false);
      stopAll();
      playStartRef.current = null;
      setPlayhead(0);

      try {
        const res = await fetch(`${API}/compute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`Server responded with ${res.status}`);
        }

        const json: ComputeResponse = await res.json();
        if (requestId !== computeRequestRef.current) {
          return;
        }
        setData(json);
        setPlaybackConfig({
          durationSec: payload.durationSec,
          dtSec: payload.dtSec,
        });
      } catch (err: any) {
        console.error(err);
        if (requestId !== computeRequestRef.current) {
          return;
        }
        setError(err?.message ?? "Failed to run simulation");
        setData(null);
        setPlaybackConfig(null);
      } finally {
        if (requestId === computeRequestRef.current) {
          setIsComputing(false);
        }
      }
    },
    [stopAll]
  );

  useEffect(() => {
    if (!system.planets.length) {
      computeRequestRef.current += 1;
      setData(null);
      setPlaybackConfig(null);
      setError(null);
      setIsComputing(false);
      setPlaying(false);
      stopAll();
      playStartRef.current = null;
      setPlayhead(0);
      return;
    }

    const payload = buildSimulationPayload();
    const requestId = ++computeRequestRef.current;
    runSimulation(payload, requestId);
  }, [system.planets, buildSimulationPayload, runSimulation, stopAll]);

  const handlePause = useCallback(() => {
    setPlaying(false);
    stopAll();
  }, []);

  const handleReset = useCallback(() => {
    setPlaying(false);
    stopAll();
    setPlayhead(0);
    playStartRef.current = null;
  }, []);

  const handlePlay = useCallback(() => {
    if (!data || !playbackConfig || isComputing) return;
    if (!hasSimData) return;

    // Start or resume from the current playhead
    playStartRef.current = performance.now() - playhead * 1000;
    setPlaying(true);
  }, [data, playbackConfig, hasSimData, isComputing, playhead]);

  // Animation loop driven by state
  useEffect(() => {
    if (!playing || !data || !playbackConfig || !hasSimData) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const samples: any[] = (data as any).samples;
    const dt = playbackConfig.dtSec;
    const totalSamples = samples.length;
    const totalDuration = Math.max(totalSamples * dt, playbackConfig.durationSec);

    if (playStartRef.current == null) {
      playStartRef.current = performance.now() - playhead * 1000;
    }

    const tick = (now: number) => {
      if (!playStartRef.current) return;
      const elapsedSec = (now - playStartRef.current) / 1000;
      const wrapped =
        ((elapsedSec % totalDuration) + totalDuration) % totalDuration;
      setPlayhead(wrapped);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, data, playbackConfig, hasSimData, playhead]);

  const currentSample = useMemo(() => {
    if (!data || !hasSimData) return null;
    const samples: any[] = (data as any).samples ?? [];
    const dt = playbackConfig?.dtSec ?? system.dtSec;
    const totalSamples = samples.length;
    if (totalSamples === 0 || !Number.isFinite(dt) || dt <= 0) return null;

    const totalDuration = totalSamples * dt;
    const t = ((playhead % totalDuration) + totalDuration) % totalDuration;
    const idx = Math.min(totalSamples - 1, Math.floor(t / dt));
    return samples[idx] ?? null;
  }, [data, hasSimData, playbackConfig, system.dtSec, playhead]);

  const renderScale = useMemo(() => {
    if (!currentSample || !Array.isArray(currentSample.planets)) return 100;
    const maxOrbit = currentSample.planets.reduce(
      (max: number, p: Planet) =>
        Math.max(max, Math.abs((p as any).aAU ?? 0)),
      1
    );
    return maxOrbit > 0 ? 220 / maxOrbit : 100;
  }, [currentSample]);

  const renderPlanets = useCallback(() => {
    if (!currentSample || !Array.isArray(currentSample.planets)) return null;
    return currentSample.planets.map((p: Planet) => {
      const { x, y, name, radius, color, kind } = p as any;
      if (typeof x !== "number" || typeof y !== "number") return null;
      return (
        <circle
          key={name}
          cx={250 + x * renderScale}
          cy={250 + y * renderScale}
          r={radius ?? 6}
          fill={color ?? (kind === "rocky" ? "#aaa" : "#4af")}
        />
      );
    });
  }, [currentSample, renderScale]);

  const getSimCoords = useCallback(
    (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      const bounds = evt.currentTarget.getBoundingClientRect();
      const xPx = evt.clientX - bounds.left;
      const yPx = evt.clientY - bounds.top;
      const center = 250;
      const simX = (xPx - center) / renderScale;
      const simY = (yPx - center) / renderScale;
      if (!Number.isFinite(simX) || !Number.isFinite(simY)) {
        return null;
      }
      return { simX, simY };
    },
    [renderScale]
  );

  const updatePendingAt = useCallback(
    (simX: number, simY: number) => {
      const distance = Math.sqrt(simX * simX + simY * simY) || 0.1;
      const baseName = customBody.kind === "gas" ? "Gas Giant" : "Rocky Body";
      const mass = computeMassFromConfig(customBody);
      setPendingPlanet((prev) => {
        const name = prev?.name ?? makeUniqueName(baseName);
        return {
          name,
          kind: customBody.kind,
          color: customBody.color,
          radius: customBody.radius,
          mass,
          aAU: distance,
          position: [simX, simY, 0],
        };
      });
    },
    [customBody, computeMassFromConfig, makeUniqueName]
  );

  const handleCanvasMouseDown = useCallback(
    (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!placementMode) return;
      const coords = getSimCoords(evt);
      if (!coords) return;
      updatePendingAt(coords.simX, coords.simY);
      setIsDragging(true);
    },
    [placementMode, getSimCoords, updatePendingAt]
  );

  const handleCanvasMouseMove = useCallback(
    (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!placementMode || !isDragging) return;
      const coords = getSimCoords(evt);
      if (!coords) return;
      updatePendingAt(coords.simX, coords.simY);
    },
    [placementMode, isDragging, getSimCoords, updatePendingAt]
  );

  const handleCanvasMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  const handleCanvasMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
    }
  }, [isDragging]);

  const canPlay = !!data && !!playbackConfig && hasSimData && !isComputing;
  const canPause = playing;
  const canReset = !!data && hasSimData;

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div
        style={{
          width: 360,
          padding: 16,
      overflowY: "auto",
      background: "#111",
      color: "#f5f5f5",
    }}
  >
        <h2>Custom Bodies</h2>
        <p>
          Design every object yourself. Use the custom body controls below to choose
          physical traits, start placement, then click and drag on the simulation to preview and
          add it to the system.
        </p>

        <CustomBodyPanel
          config={customBody}
          onChange={setCustomBody}
          placementActive={placementMode}
          onPlacementToggle={handlePlacementToggle}
          canCommit={!!pendingPlanet}
          onCommit={confirmCustomBody}
          onClear={clearPreview}
          predicting={predicting}
        />

        <h3 style={{ marginTop: 24 }}>Selected Bodies</h3>
        {system.planets.length === 0 && (
          <p>No bodies yet. Use the custom body panel above to add them.</p>
        )}
        {system.planets.map((planet, index) => (
          <div
            key={`${planet.name}-${index}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 0",
              borderBottom: "1px solid #333",
            }}
          >
            <div>
              <strong>{planet.name}</strong>{" "}
              <span style={{ color: "#aaa" }}>{planet.kind}</span>
              <div style={{ fontSize: 12, color: "#888" }}>
                Orbit: {planet.aAU.toFixed(2)} AU • Color: {planet.color}
              </div>
              {planet.position && (
                <div style={{ fontSize: 11, color: "#666" }}>
                  Position: (
                  {planet.position[0].toFixed(2)},{" "}
                  {planet.position[1].toFixed(2)})
                </div>
              )}
            </div>
            <button onClick={() => removePlanet(index)}>Remove</button>
          </div>
        ))}

        <div style={{ marginTop: 24, fontSize: 12, color: "#aaa" }}>
          <div>Simulation auto-updates (30s window, dt 0.016s).</div>
          {isComputing && <div style={{ color: "#ddd", marginTop: 6 }}>Simulating latest changes…</div>}
          {playbackConfig && !isComputing && (
            <div style={{ marginTop: 6 }}>
              Last simulation complete: duration {playbackConfig.durationSec}s, dt {playbackConfig.dtSec}s
            </div>
          )}
          {error && (
            <p style={{ color: "salmon", marginTop: 8 }}>{error}</p>
          )}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 8, padding: 8 }}>
          <button onClick={handlePlay} disabled={!canPlay}>
            Play
          </button>
          <button onClick={handlePause} disabled={!canPause}>
            Pause
          </button>
          <button onClick={handleReset} disabled={!canReset}>
            Reset
          </button>
          {hasSimData && (
            <div style={{ marginLeft: 16, color: "#ccc" }}>
              t = {playhead.toFixed(2)} s
            </div>
          )}
        </div>
        <svg
          width="500"
          height="500"
          style={{ background: "#222", cursor: placementMode ? "crosshair" : "default" }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
        >
          {trajectory?.points?.length ? (
            <polyline
              points={trajectory.points
                .map((pt) => `${250 + pt.x * renderScale},${250 + pt.y * renderScale}`)
                .join(" ")}
              stroke="#888"
              strokeDasharray="4 6"
              fill="none"
              opacity={0.7}
            />
          ) : null}
          {renderPlanets()}
          {pendingPlanet?.position && (
            <circle
              cx={250 + pendingPlanet.position[0] * renderScale}
              cy={250 + pendingPlanet.position[1] * renderScale}
              r={pendingPlanet.radius}
              fill={pendingPlanet.color}
              opacity={0.5}
              stroke="#fff"
              strokeDasharray="3 3"
            />
          )}
        </svg>
      </div>
    </div>
  );
};

export default App;
