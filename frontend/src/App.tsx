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
import { stopAll, playEvents } from "./audio";
import CustomBodyPanel from "./components/CustomBodyPanel";

const API = "http://localhost:8000/api";

const RENDERSCALE = 500;

const DEFAULT_PLANET_COLORS: Record<CustomBodyConfig["kind"], string> = {
  rocky: "#aaaaaa",
  gas: "#4af4ff",
};

const computeMassFromConfig = (cfg: CustomBodyConfig): number => {
  const base = Math.max(cfg.radius, 1);
  const mass = cfg.kind === "gas" ? base * 0.006 : base * 0.003;
  return parseFloat(mass.toFixed(3));
};

const ensurePlanetForPayload = (planet: BodyTemplate): BodyTemplate => {
  const kind = planet.kind ?? "rocky";
  const radius = planet.radius ?? 6;
  const color = planet.color ?? DEFAULT_PLANET_COLORS[kind];
  const ellipticity = planet.ellipticity ?? 0;
  const rawMass = (planet as any).mass;
  const mass =
    typeof rawMass === "number" && Number.isFinite(rawMass)
      ? rawMass
      : computeMassFromConfig({ kind, color, radius, ellipticity });
  return {
    ...planet,
    kind,
    radius,
    color,
    ellipticity,
    mass,
  };
};

const defaultPreset: SystemPreset = {
  star: { massMs: 1.0 },
  planets: [],
  durationSec: 10,
  dtSec: 0.016,
  musicMode: "rich",
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

  const [selectedPlanetName, setSelectedPlanetName] = useState<string | null>(
    null
  );
  const [customBody, setCustomBody] = useState<CustomBodyConfig>({
    kind: "rocky",
    color: "#ffffff",
    radius: 6,
    ellipticity: 0,
  });

  const [trajectory, setTrajectory] = useState<{
    planetName: string;
    points: { x: number; y: number }[];
  } | null>(null);
  const [predicting, setPredicting] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [draggingPlanetName, setDraggingPlanetName] = useState<string | null>(
    null
  );

  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<number | null>(null);
  const previewRequestRef = useRef(0);
  const previewDebounceRef = useRef<number | null>(null);
  const computeRequestRef = useRef(0);
  const audioLoopActiveRef = useRef(false);
  const playingRef = useRef(playing);

  const hasSimData =
    !!data &&
    Array.isArray((data as any).samples) &&
    (data as any).samples.length > 0;

  const makeUniqueName = useCallback(
    (base: string) => {
      const sanitized = base.trim() || "Planet";
      const existing = new Set(system.planets.map((p) => p.name));
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
    let removedName: string | null = null;
    setSystem((prev) => {
      if (index < 0 || index >= prev.planets.length) return prev;
      removedName = prev.planets[index].name;
      const planets = prev.planets.filter((_, i) => i !== index);
      return { ...prev, planets };
    });
    setSelectedPlanetName((prev) =>
      removedName && prev === removedName ? null : prev
    );
  }, []);

  const syncCustomBodyToPlanet = useCallback((planet: BodyTemplate) => {
    setCustomBody({
      kind: planet.kind,
      color: planet.color ?? "#ffffff",
      radius: planet.radius ?? 6,
      ellipticity: planet.ellipticity ?? 0,
    });
  }, []);

  const handleBodySelect = useCallback(
    (index: number) => {
      const planet = system.planets[index];
      if (!planet) return;
      setSelectedPlanetName(planet.name);
      syncCustomBodyToPlanet(planet);
      setTrajectory(null);
      setDraggingPlanetName(null);
    },
    [system.planets, syncCustomBodyToPlanet]
  );

  useEffect(() => {
    if (!selectedPlanetName) return;
    const target = system.planets.find((p) => p.name === selectedPlanetName);
    if (!target) return;
    syncCustomBodyToPlanet(target);
  }, [selectedPlanetName, system.planets, syncCustomBodyToPlanet]);

  const buildSimulationPayload = useCallback(
    (planetsOverride?: BodyTemplate[]) => {
      const clonePlanets = (planetsOverride ?? system.planets)
        .map((p) => ({ ...p }))
        .map(ensurePlanetForPayload);
      return {
        star: { ...system.star },
        planets: clonePlanets,
        durationSec: system.durationSec,
        dtSec: system.dtSec,
        musicMode: system.musicMode,
      };
    },
    [
      system.star,
      system.planets,
      system.durationSec,
      system.dtSec,
      system.musicMode,
    ]
  );

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
    []
  );

  // Recompute sim when planets change, but not while dragging
  useEffect(() => {
    if (isDragging) {
      return;
    }

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
  }, [system.planets, buildSimulationPayload, runSimulation, isDragging]);

  const fetchTrajectoryPreview = useCallback(
    async (planet: BodyTemplate) => {
      const requestId = ++previewRequestRef.current;
      setPredicting(true);
      // Do not clear trajectory here; keep old one until new one is ready

      try {
        const overridePlanets = (() => {
          const idx = system.planets.findIndex((p) => p.name === planet.name);
          if (idx === -1) {
            return [...system.planets, planet];
          }
          const clone = system.planets.map((p) => ({ ...p }));
          clone[idx] = { ...planet };
          return clone;
        })();

        const payload = buildSimulationPayload(overridePlanets);
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
          // Keep old trajectory instead of clearing completely
          // setTrajectory(null);
        }
      } finally {
        if (previewRequestRef.current === requestId) {
          setPredicting(false);
        }
      }
    },
    [system.planets, buildSimulationPayload]
  );

  const scheduleTrajectoryPreview = useCallback(
    (planet: BodyTemplate) => {
      if (previewDebounceRef.current !== null) {
        window.clearTimeout(previewDebounceRef.current);
      }
      // Shorter debounce for more responsive dragging
      const handle = window.setTimeout(() => {
        fetchTrajectoryPreview(planet);
        previewDebounceRef.current = null;
      }, 80);
      previewDebounceRef.current = handle;
    },
    [fetchTrajectoryPreview]
  );

  useEffect(() => {
    return () => {
      if (previewDebounceRef.current !== null) {
        window.clearTimeout(previewDebounceRef.current);
      }
    };
  }, []);

  const handleSpawnPlanet = useCallback(() => {
    const baseName = customBody.kind === "gas" ? "Gas Giant" : "Rocky Body";
    const name = makeUniqueName(baseName);
    const mass = computeMassFromConfig(customBody);
    const orbit = 0.3 + system.planets.length * 0.15;
    const newPlanet: BodyTemplate = {
      name,
      kind: customBody.kind,
      color: customBody.color,
      radius: customBody.radius,
      ellipticity: customBody.ellipticity,
      mass,
      aAU: orbit,
      position: [orbit, 0, 0],
    };

    setSystem((prev) => ({
      ...prev,
      planets: [...prev.planets, newPlanet],
    }));
    setSelectedPlanetName(name);
    syncCustomBodyToPlanet(newPlanet);
    setTrajectory(null);
    scheduleTrajectoryPreview(newPlanet);
  }, [
    customBody,
    makeUniqueName,
    system.planets.length,
    syncCustomBodyToPlanet,
    scheduleTrajectoryPreview,
  ]);

  const handleCustomBodyChange = useCallback(
    (cfg: CustomBodyConfig) => {
      setCustomBody(cfg);
      if (!selectedPlanetName) return;
      const mass = computeMassFromConfig(cfg);
      let updatedPlanet: BodyTemplate | null = null;

      setSystem((prev) => {
        const planets = prev.planets.map((planet) => {
          if (planet.name !== selectedPlanetName) return planet;
          const next: BodyTemplate = {
            ...planet,
            ...cfg,
            mass,
          };
          updatedPlanet = next;
          return next;
        });
        return { ...prev, planets };
      });

      if (updatedPlanet) {
        scheduleTrajectoryPreview(updatedPlanet);
      }
    },
    [selectedPlanetName, scheduleTrajectoryPreview]
  );

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

  const startAudioLoop = useCallback(() => {
    if (!data?.events?.length) {
      return;
    }
    audioLoopActiveRef.current = true;
    playEvents(data.events, () => {
      if (audioLoopActiveRef.current && playingRef.current) {
        startAudioLoop();
      }
    });
  }, [data]);

  useEffect(() => {
    playingRef.current = playing;
    if (!playing) {
      audioLoopActiveRef.current = false;
    }
  }, [playing]);

  const handlePlay = useCallback(() => {
    if (!data || !playbackConfig || isComputing) return;
    if (!hasSimData) return;

    startAudioLoop();
    playStartRef.current = performance.now() - playhead * 1000;
    setPlaying(true);
  }, [data, playbackConfig, isComputing, hasSimData, playhead, startAudioLoop]);

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

  const renderScale = RENDERSCALE / 2;

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

  const renderPlanets = useCallback(() => {
    if (!currentSample || !Array.isArray(currentSample.planets)) return null;

    const draggingTemplate =
      draggingPlanetName != null
        ? system.planets.find((p) => p.name === draggingPlanetName)
        : null;

    return currentSample.planets.map((p: Planet) => {
      let { x, y, name, radius, color, kind } = p as any;
      if (typeof x !== "number" || typeof y !== "number") return null;

      // While dragging, override the simulated position for the dragged planet
      if (
        draggingTemplate &&
        name === draggingTemplate.name &&
        draggingTemplate.position
      ) {
        x = draggingTemplate.position[0];
        y = draggingTemplate.position[1];
      }

      const cx = 250 + x * renderScale;
      const cy = 250 + y * renderScale;

      return (
        <circle
          key={name}
          cx={cx}
          cy={cy}
          r={radius ?? 6}
          fill={color ?? (kind === "rocky" ? "#aaa" : "#4af")}
        />
      );
    });
  }, [currentSample, renderScale, draggingPlanetName, system.planets]);

  const findPlanetIndexAtEvent = useCallback(
    (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!currentSample || !Array.isArray(currentSample.planets)) {
        return null;
      }
      const bounds = evt.currentTarget.getBoundingClientRect();
      const xPx = evt.clientX - bounds.left;
      const yPx = evt.clientY - bounds.top;
      const center = 250;
      const planets = currentSample.planets as Planet[];

      for (let i = planets.length - 1; i >= 0; i -= 1) {
        const planet = planets[i];
        const px = center + (planet.x || 0) * renderScale;
        const py = center + (planet.y || 0) * renderScale;
        const radius = (planet.radius ?? 6) + 4;
        const dx = xPx - px;
        const dy = yPx - py;
        if (dx * dx + dy * dy <= radius * radius) {
          const idx = system.planets.findIndex((p) => p.name === planet.name);
          return idx >= 0 ? idx : null;
        }
      }
      return null;
    },
    [currentSample, renderScale, system.planets]
  );

  const handleCanvasMouseDown = useCallback(
    (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      const index = findPlanetIndexAtEvent(evt);
      if (index === null) return;

      const planet = system.planets[index];
      setSelectedPlanetName(planet.name);
      syncCustomBodyToPlanet(planet);
      setDraggingPlanetName(planet.name);
      setIsDragging(true);

      // Do NOT schedule trajectory here; we want the first preview
      // to be based on the *dragged* position, not the original one.
    },
    [findPlanetIndexAtEvent, system.planets, syncCustomBodyToPlanet]
  );

  const handleCanvasMouseMove = useCallback(
    (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!isDragging || !draggingPlanetName) return;
      const coords = getSimCoords(evt);
      if (!coords) return;
      const { simX, simY } = coords;
      const distance = Math.sqrt(simX * simX + simY * simY) || 0.01;

      let updatedPlanet: BodyTemplate | null = null;
      setSystem((prev) => {
        const idx = prev.planets.findIndex(
          (p) => p.name === draggingPlanetName
        );
        if (idx === -1) return prev;
        const planets = prev.planets.map((p, i) => {
          if (i !== idx) return p;
          const next: BodyTemplate = {
            ...p,
            aAU: distance,
            position: [simX, simY, 0],
          };
          updatedPlanet = next;
          return next;
        });
        return { ...prev, planets };
      });

      if (updatedPlanet) {
        scheduleTrajectoryPreview(updatedPlanet);
      }
    },
    [
      isDragging,
      draggingPlanetName,
      getSimCoords,
      scheduleTrajectoryPreview,
    ]
  );

  const stopDragging = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    setDraggingPlanetName(null);
  }, [isDragging]);

  const handleCanvasMouseUp = useCallback(() => {
    stopDragging();
  }, [stopDragging]);

  const handleCanvasMouseLeave = useCallback(() => {
    stopDragging();
  }, [stopDragging]);

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
          Click or drag any planet in the simulation to edit it here. Spawn a
          new planet, then drag it to place it while the predicted trajectory
          updates.
        </p>

        <CustomBodyPanel
          config={customBody}
          onChange={handleCustomBodyChange}
          selectedName={selectedPlanetName}
          onSpawn={handleSpawnPlanet}
          hasPending={false}
          spawnPending={false}
          predicting={predicting}
        />

        <h3 style={{ marginTop: 24 }}>Bodies</h3>
        <p style={{ fontSize: 12, color: "#888" }}>
          Click any body to tweak it, then drag it on the simulation to
          reposition.
        </p>
        {system.planets.length === 0 && (
          <p>No bodies yet. Use the controls above to add one.</p>
        )}
        {system.planets.map((planet, index) => (
          <div
            key={`${planet.name}-${index}`}
            onClick={() => handleBodySelect(index)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 0",
              borderBottom: "1px solid #333",
              cursor: "pointer",
            }}
            title="Click to edit this body"
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                removePlanet(index);
              }}
            >
              Remove
            </button>
          </div>
        ))}

        <div style={{ marginTop: 24, fontSize: 12, color: "#aaa" }}>
          <div>Simulation auto updates (30 s window, dt 0.016 s).</div>
          {isComputing && (
            <div style={{ color: "#ddd", marginTop: 6 }}>
              Simulating latest changes…
            </div>
          )}
          {playbackConfig && !isComputing && (
            <div style={{ marginTop: 6 }}>
              Last simulation complete: duration {playbackConfig.durationSec}s,
              dt {playbackConfig.dtSec}s
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
          style={{
            background: "#222",
            cursor: isDragging ? "grabbing" : "pointer",
          }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
        >
          {trajectory?.points?.length ? (
            <polyline
              points={trajectory.points
                .map(
                  (pt) =>
                    `${250 + pt.x * renderScale},${250 + pt.y * renderScale}`
                )
                .join(" ")}
              stroke="#888"
              strokeDasharray="4 6"
              fill="none"
              opacity={0.7}
            />
          ) : null}
          {renderPlanets()}
        </svg>
      </div>
    </div>
  );
};

export default App;
