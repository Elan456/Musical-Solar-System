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
const RENDER_SCALE = 500;
const CANVAS_SIZE = 500;
const CANVAS_CENTER = CANVAS_SIZE / 2;

const DEFAULT_PLANET_COLORS: Record<CustomBodyConfig["kind"], string> = {
  rocky: "#a0a0a0",
  gas: "#4af4ff",
};

const getSimulationKey = (planets: BodyTemplate[]): string => {
  // Only include properties that affect the physics simulation
  return JSON.stringify(
    planets.map((p) => ({
      name: p.name,
      mass: p.mass,
      aAU: p.aAU,
      radius: p.radius,
      ellipticity: p.ellipticity,
      position: p.position,
      kind: p.kind, // affects mass calculation
    }))
  );
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
  return { ...planet, kind, radius, color, ellipticity, mass };
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
  const [playbackConfig, setPlaybackConfig] = useState<PlaybackConfig | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlanetName, setSelectedPlanetName] = useState<string | null>(null);
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
  const [draggingPlanetName, setDraggingPlanetName] = useState<string | null>(null);
  const latestDraggedPlanetRef = useRef<BodyTemplate | null>(null);

  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<number | null>(null);
  const computeRequestRef = useRef(0);
  const previewRequestRef = useRef(0);
  const audioLoopActiveRef = useRef(false);
  const playingRef = useRef(playing);
  const loopDurationRef = useRef<number>(10);

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
    setSelectedPlanetName((prev) => (removedName && prev === removedName ? null : prev));
    setTrajectory((prev) => (removedName && prev?.planetName === removedName ? null : prev));
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
      latestDraggedPlanetRef.current = null;
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
    [system.star, system.planets, system.durationSec, system.dtSec, system.musicMode]
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

        if (!res.ok) throw new Error(`Server responded with ${res.status}`);

        const json: ComputeResponse = await res.json();
        if (requestId !== computeRequestRef.current) return;

        setData(json);
        setPlaybackConfig({
          durationSec: payload.durationSec,
          dtSec: payload.dtSec,
        });

        // Store loop duration for audio sync
        const samples = json.samples ?? [];
        loopDurationRef.current = Math.max(samples.length * payload.dtSec, payload.durationSec);
      } catch (err: any) {
        console.error(err);
        if (requestId !== computeRequestRef.current) return;
        setError(err?.message ?? "Failed to run simulation");
        setData(null);
        setPlaybackConfig(null);
      } finally {
        if (requestId === computeRequestRef.current) setIsComputing(false);
      }
    },
    []
  );

  const lastSimKeyRef = useRef<string>("");


  useEffect(() => {
    if (isDragging) return;

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

    // Check if simulation-relevant properties changed
    const simKey = getSimulationKey(system.planets);
    if (simKey === lastSimKeyRef.current) {
      // Only visual properties changed (like color), skip resim
      return;
    }
    lastSimKeyRef.current = simKey;

    const payload = buildSimulationPayload();
    const requestId = ++computeRequestRef.current;
    runSimulation(payload, requestId);
  }, [system.planets, buildSimulationPayload, runSimulation, isDragging]);

  const computeTrajectoryPreview = useCallback(
    async (planet: BodyTemplate) => {
      const requestId = ++previewRequestRef.current;
      setPredicting(true);

      try {
        const idx = system.planets.findIndex((p) => p.name === planet.name);
        const overridePlanets =
          idx === -1
            ? [...system.planets, planet]
            : system.planets.map((p, i) => (i === idx ? { ...planet } : { ...p }));

        const payload = buildSimulationPayload(overridePlanets);
        const res = await fetch(`${API}/compute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Server responded with ${res.status}`);

        const json: ComputeResponse = await res.json();
        if (previewRequestRef.current !== requestId) return;

        const points =
          json.samples
            ?.map((sample) => sample.planets.find((p: Planet) => p.name === planet.name))
            .filter(Boolean)
            .map((p: Planet) => ({ x: p.x, y: p.y })) ?? [];

        setTrajectory({ planetName: planet.name, points });
      } catch (err) {
        console.error("Failed to compute trajectory preview", err);
      } finally {
        if (previewRequestRef.current === requestId) setPredicting(false);
      }
    },
    [system.planets, buildSimulationPayload]
  );

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
    computeTrajectoryPreview(newPlanet);
  }, [customBody, makeUniqueName, system.planets.length, syncCustomBodyToPlanet, computeTrajectoryPreview]);

  const handleCustomBodyChange = useCallback(
    (cfg: CustomBodyConfig) => {
      setCustomBody(cfg);
      if (!selectedPlanetName) return;

      // Find current planet to check what changed
      const currentPlanet = system.planets.find((p) => p.name === selectedPlanetName);
      const onlyColorChanged = currentPlanet && 
        currentPlanet.kind === cfg.kind &&
        currentPlanet.radius === cfg.radius &&
        currentPlanet.ellipticity === cfg.ellipticity;

      const mass = computeMassFromConfig(cfg);
      let updatedPlanet: BodyTemplate | null = null;

      setSystem((prev) => {
        const planets = prev.planets.map((planet) => {
          if (planet.name !== selectedPlanetName) return planet;
          const next: BodyTemplate = { ...planet, ...cfg, mass };
          updatedPlanet = next;
          return next;
        });
        return { ...prev, planets };
      });

      if (updatedPlanet && !isDragging && !onlyColorChanged) computeTrajectoryPreview(updatedPlanet);
    },
    [selectedPlanetName, computeTrajectoryPreview, isDragging]
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

  // Audio loop with proper sync
  const startAudioLoop = useCallback(() => {
    if (!data?.events?.length) return;
    audioLoopActiveRef.current = true;

    // Sync: reset playhead to 0 and record the start time
    playStartRef.current = performance.now();
    setPlayhead(0);

    playEvents(data.events, loopDurationRef.current, () => {
      if (audioLoopActiveRef.current && playingRef.current) {
        // Restart both audio and visual in sync
        startAudioLoop();
      }
    });
  }, [data]);

  useEffect(() => {
    playingRef.current = playing;
    if (!playing) audioLoopActiveRef.current = false;
  }, [playing]);

  const handlePlay = useCallback(() => {
    if (!data || !playbackConfig || isComputing || !hasSimData) return;
    setPlaying(true);
    startAudioLoop();
  }, [data, playbackConfig, isComputing, hasSimData, startAudioLoop]);

  // Visual playhead animation
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
    const totalDuration = loopDurationRef.current;

    const tick = (now: number) => {
      if (!playStartRef.current) {
        playStartRef.current = now;
      }
      const elapsedSec = (now - playStartRef.current) / 1000;
      // Don't wrap here - let audio loop handle the restart
      const clamped = Math.min(elapsedSec, totalDuration);
      setPlayhead(clamped);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing, data, playbackConfig, hasSimData]);

  const currentSample = useMemo(() => {
    if (!data || !hasSimData) return null;
    const samples: any[] = (data as any).samples ?? [];
    const dt = playbackConfig?.dtSec ?? system.dtSec;
    const totalSamples = samples.length;
    if (totalSamples === 0 || !Number.isFinite(dt) || dt <= 0) return null;

    const totalDuration = totalSamples * dt;
    const t = Math.min(playhead, totalDuration - dt);
    const idx = Math.min(totalSamples - 1, Math.max(0, Math.floor(t / dt)));
    return samples[idx] ?? null;
  }, [data, hasSimData, playbackConfig, system.dtSec, playhead]);

  const renderScale = RENDER_SCALE / 2;

  const getSimCoords = useCallback(
    (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      const bounds = evt.currentTarget.getBoundingClientRect();
      const xPx = evt.clientX - bounds.left;
      const yPx = evt.clientY - bounds.top;
      const simX = (xPx - CANVAS_CENTER) / renderScale;
      const simY = (yPx - CANVAS_CENTER) / renderScale;
      if (!Number.isFinite(simX) || !Number.isFinite(simY)) return null;
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

      if (draggingTemplate && name === draggingTemplate.name && draggingTemplate.position) {
        x = draggingTemplate.position[0];
        y = draggingTemplate.position[1];
      }

      const cx = CANVAS_CENTER + x * renderScale;
      const cy = CANVAS_CENTER + y * renderScale;
      const isSelected = name === selectedPlanetName;

      return (
        <g key={name}>
          {isSelected && (
            <circle
              cx={cx}
              cy={cy}
              r={(radius ?? 6) + 4}
              fill="none"
              stroke="#fff"
              strokeWidth={2}
              opacity={0.6}
            />
          )}
          <circle
            cx={cx}
            cy={cy}
            r={radius ?? 6}
            fill={color ?? (kind === "rocky" ? "#aaa" : "#4af")}
          />
        </g>
      );
    });
  }, [currentSample, renderScale, draggingPlanetName, system.planets, selectedPlanetName]);

  const findPlanetIndexAtEvent = useCallback(
    (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!currentSample || !Array.isArray(currentSample.planets)) return null;

      const bounds = evt.currentTarget.getBoundingClientRect();
      const xPx = evt.clientX - bounds.left;
      const yPx = evt.clientY - bounds.top;
      const planets = currentSample.planets as Planet[];

      for (let i = planets.length - 1; i >= 0; i -= 1) {
        const planet = planets[i];
        const px = CANVAS_CENTER + (planet.x || 0) * renderScale;
        const py = CANVAS_CENTER + (planet.y || 0) * renderScale;
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
      latestDraggedPlanetRef.current = planet;
      previewRequestRef.current += 1;
      setTrajectory(null);
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

      setSystem((prev) => {
        const idx = prev.planets.findIndex((p) => p.name === draggingPlanetName);
        if (idx === -1) return prev;

        const planets = prev.planets.map((p, i) => {
          if (i !== idx) return p;
          const next: BodyTemplate = { ...p, aAU: distance, position: [simX, simY, 0] };
          latestDraggedPlanetRef.current = next;
          return next;
        });

        return { ...prev, planets };
      });
    },
    [isDragging, draggingPlanetName, getSimCoords]
  );

  const stopDragging = useCallback(() => {
    if (!isDragging) return;

    const finalPlanet = latestDraggedPlanetRef.current;
    setIsDragging(false);
    setDraggingPlanetName(null);

    if (finalPlanet) computeTrajectoryPreview(finalPlanet);
  }, [isDragging, computeTrajectoryPreview]);

  const handleCanvasMouseUp = useCallback(() => stopDragging(), [stopDragging]);
  const handleCanvasMouseLeave = useCallback(() => stopDragging(), [stopDragging]);

  const canPlay = !!data && !!playbackConfig && hasSimData && !isComputing && !playing;
  const canPause = playing;
  const canReset = !!data && hasSimData;

  const totalDuration = loopDurationRef.current;
  const progress = totalDuration > 0 ? (playhead / totalDuration) * 100 : 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>🪐 Musical Solar System</h1>
        <p style={styles.subtitle}>Create planets and hear the music of their orbits</p>
      </header>

      <div style={styles.main}>
        {/* Left Panel - Controls */}
        <aside style={styles.sidebar}>
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Create Body</h2>
            <CustomBodyPanel
              config={customBody}
              onChange={handleCustomBodyChange}
              selectedName={selectedPlanetName}
              onSpawn={handleSpawnPlanet}
              hasPending={false}
              spawnPending={false}
              predicting={predicting}
            />
          </section>

          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>
              Bodies ({system.planets.length})
            </h2>
            
            {system.planets.length === 0 ? (
              <p style={styles.emptyText}>
                No bodies yet. Create one above and drag it into position.
              </p>
            ) : (
              <div style={styles.planetList}>
                {system.planets.map((planet, index) => (
                  <div
                    key={`${planet.name}-${index}`}
                    onClick={() => handleBodySelect(index)}
                    style={{
                      ...styles.planetItem,
                      ...(selectedPlanetName === planet.name ? styles.planetItemSelected : {}),
                    }}
                  >
                    <div style={styles.planetInfo}>
                      <div style={styles.planetHeader}>
                        <span
                          style={{
                            ...styles.planetDot,
                            backgroundColor: planet.color,
                          }}
                        />
                        <strong style={styles.planetName}>{planet.name}</strong>
                        <span style={styles.planetKind}>{planet.kind}</span>
                      </div>
                      <div style={styles.planetDetails}>
                        Orbit: {planet.aAU.toFixed(2)} AU
                        {planet.ellipticity > 0 && ` • Ellipticity: ${planet.ellipticity.toFixed(2)}`}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removePlanet(index);
                      }}
                      style={styles.removeButton}
                      title="Remove planet"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Status */}
          <div style={styles.status}>
            {isComputing && <span style={styles.statusComputing}>⏳ Simulating...</span>}
            {error && <span style={styles.statusError}>{error}</span>}
          </div>
        </aside>

        {/* Center - Simulation View */}
        <main style={styles.simContainer}>
          {/* Playback Controls */}
          <div style={styles.controls}>
            <button
              onClick={handlePlay}
              disabled={!canPlay}
              style={{ ...styles.controlButton, ...(canPlay ? styles.playButton : {}) }}
            >
              ▶ Play
            </button>
            <button
              onClick={handlePause}
              disabled={!canPause}
              style={styles.controlButton}
            >
              ⏸ Pause
            </button>
            <button
              onClick={handleReset}
              disabled={!canReset}
              style={styles.controlButton}
            >
              ↺ Reset
            </button>

            {/* Time display */}
            <div style={styles.timeDisplay}>
              <span style={styles.timeText}>
                {playhead.toFixed(1)}s / {totalDuration.toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div style={styles.progressContainer}>
            <div style={{ ...styles.progressBar, width: `${progress}%` }} />
          </div>

          {/* Canvas */}
          <svg
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{
              ...styles.canvas,
              cursor: isDragging ? "grabbing" : "default",
            }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseLeave}
          >
            {/* Background stars */}
            {[...Array(50)].map((_, i) => (
              <circle
                key={`star-${i}`}
                cx={(i * 37) % CANVAS_SIZE}
                cy={(i * 53) % CANVAS_SIZE}
                r={Math.random() > 0.5 ? 1 : 0.5}
                fill="#ffffff"
                opacity={0.3 + (i % 5) * 0.1}
              />
            ))}

            {/* Central star */}
            <circle cx={CANVAS_CENTER} cy={CANVAS_CENTER} r={15} fill="#ffdd44" />
            <circle cx={CANVAS_CENTER} cy={CANVAS_CENTER} r={20} fill="#ffdd44" opacity={0.3} />
            <circle cx={CANVAS_CENTER} cy={CANVAS_CENTER} r={25} fill="#ffdd44" opacity={0.1} />

            {/* Trajectory preview */}
            {trajectory?.points?.length ? (
              <polyline
                points={trajectory.points
                  .map((pt) => `${CANVAS_CENTER + pt.x * renderScale},${CANVAS_CENTER + pt.y * renderScale}`)
                  .join(" ")}
                stroke="#6688ff"
                strokeDasharray="4 4"
                fill="none"
                opacity={0.6}
                strokeWidth={1.5}
              />
            ) : null}

            {/* Planets */}
            {renderPlanets()}
          </svg>

          {/* Instructions */}
          <p style={styles.instructions}>
            Click a planet to select it • Drag to reposition • Adjust properties in the left panel
          </p>
        </main>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0a0a0f",
    color: "#e0e0e0",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  header: {
    padding: "20px 32px",
    borderBottom: "1px solid #1a1a2e",
    background: "linear-gradient(180deg, #12121a 0%, #0a0a0f 100%)",
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 600,
    color: "#ffffff",
  },
  subtitle: {
    margin: "4px 0 0",
    fontSize: 14,
    color: "#888",
  },
  main: {
    display: "flex",
    height: "calc(100vh - 85px)",
  },
  sidebar: {
    width: 340,
    padding: 20,
    overflowY: "auto",
    borderRight: "1px solid #1a1a2e",
    backgroundColor: "#0d0d14",
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#888",
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 13,
    color: "#555",
    fontStyle: "italic",
  },
  planetList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  planetItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderRadius: 8,
    backgroundColor: "#14141f",
    cursor: "pointer",
    transition: "background-color 0.15s",
    border: "1px solid transparent",
  },
  planetItemSelected: {
    backgroundColor: "#1a1a2e",
    borderColor: "#3355aa",
  },
  planetInfo: {
    flex: 1,
  },
  planetHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  planetDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
  },
  planetName: {
    fontSize: 14,
    color: "#fff",
  },
  planetKind: {
    fontSize: 11,
    color: "#666",
    textTransform: "capitalize",
  },
  planetDetails: {
    fontSize: 11,
    color: "#555",
    marginTop: 4,
    marginLeft: 18,
  },
  removeButton: {
    background: "none",
    border: "none",
    color: "#555",
    fontSize: 14,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 4,
    transition: "color 0.15s, background-color 0.15s",
  },
  status: {
    fontSize: 12,
    padding: "8px 0",
  },
  statusComputing: {
    color: "#88aaff",
  },
  statusError: {
    color: "#ff6666",
  },
  simContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  controlButton: {
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 500,
    border: "1px solid #333",
    borderRadius: 6,
    backgroundColor: "#1a1a2e",
    color: "#ccc",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  playButton: {
    backgroundColor: "#2244aa",
    borderColor: "#3355cc",
    color: "#fff",
  },
  timeDisplay: {
    marginLeft: 16,
    padding: "6px 12px",
    backgroundColor: "#14141f",
    borderRadius: 6,
  },
  timeText: {
    fontSize: 13,
    fontFamily: "monospace",
    color: "#aaa",
  },
  progressContainer: {
    width: CANVAS_SIZE,
    height: 4,
    backgroundColor: "#1a1a2e",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#4466cc",
    borderRadius: 2,
    transition: "width 0.1s linear",
  },
  canvas: {
    backgroundColor: "#08080c",
    borderRadius: 12,
    border: "1px solid #1a1a2e",
    boxShadow: "0 4px 24px rgba(0, 0, 0, 0.4)",
  },
  instructions: {
    fontSize: 12,
    color: "#555",
    textAlign: "center",
  },
};

export default App;