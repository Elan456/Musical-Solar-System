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
} from "./types";
import { stopAll } from "./audio";
import CustomBodyPanel from "./components/CustomBodyPanel";

const API = "http://localhost:8000/api";

const BODY_CATALOG: BodyTemplate[] = [
  {
    name: "Mercury",
    kind: "rocky",
    aAU: 0.4,
    mass: 0.06,
    color: "#b8b4ad",
    radius: 4,
  },
  {
    name: "Venus",
    kind: "rocky",
    aAU: 0.7,
    mass: 0.82,
    color: "#d1a16b",
    radius: 5,
  },
  {
    name: "Earth",
    kind: "rocky",
    aAU: 1.0,
    mass: 1.0,
    color: "#4cafef",
    radius: 6,
  },
  {
    name: "Mars",
    kind: "rocky",
    aAU: 1.5,
    mass: 0.11,
    color: "#c1440e",
    radius: 5,
  },
  {
    name: "Jupiter",
    kind: "gas",
    aAU: 2.5,
    mass: 20,
    color: "#c58b50",
    radius: 10,
  },
  {
    name: "Saturn",
    kind: "gas",
    aAU: 3.5,
    mass: 10,
    color: "#d8c177",
    radius: 9,
  },
];

const defaultPreset: SystemPreset = {
  star: { massMs: 1.0 },
  planets: [],
  durationSec: 300,
  dtSec: 0.1,
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
  const [customBody, setCustomBody] = useState<BodyTemplate>({
    name: "Custom",
    kind: "rocky",
    aAU: 1.0,
    mass: 0.5,
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

  const rafRef = useRef<number | null>(null);
  const playStartRef = useRef<number | null>(null);

  const hasSimData =
    !!data && Array.isArray((data as any).samples) && (data as any).samples.length > 0;

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

  const addBodyToSystem = useCallback(
    (template: BodyTemplate) => {
      setSystem((prev) => {
        const planet = { ...template, name: makeUniqueName(template.name) };
        return { ...prev, planets: [...prev.planets, planet] };
      });
    },
    [makeUniqueName]
  );

  const removePlanet = useCallback((index: number) => {
    setSystem((prev) => ({
      ...prev,
      planets: prev.planets.filter((_, i) => i !== index),
    }));
  }, []);

  const handleSystemChange = useCallback(
    (key: "durationSec" | "dtSec", value: number) => {
      if (!Number.isFinite(value)) return;
      setSystem((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const clearPreview = useCallback(() => {
    setPendingPlanet(null);
    setTrajectory(null);
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
        { ...pendingPlanet, name: makeUniqueName(pendingPlanet.name) },
      ],
    }));
    clearPreview();
    setPlacementMode(false);
  }, [pendingPlanet, clearPreview, makeUniqueName]);

  const fetchTrajectoryPreview = useCallback(
    async (planet: BodyTemplate) => {
      setPredicting(true);
      setTrajectory(null);
      try {
        const payload = {
          ...system,
          planets: [...system.planets, planet],
          durationSec: Math.min(system.durationSec, 120),
        };
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
        setTrajectory({ planetName: planet.name, points });
      } catch (err) {
        console.error("Failed to predict trajectory", err);
        setTrajectory(null);
      } finally {
        setPredicting(false);
      }
    },
    [system]
  );

  const fetchCompute = useCallback(async () => {
    if (!system.planets.length || isComputing) return;

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
        body: JSON.stringify(system),
      });

      if (!res.ok) {
        throw new Error(`Server responded with ${res.status}`);
      }

      const json: ComputeResponse = await res.json();
      setData(json);
      setPlaybackConfig({
        durationSec: system.durationSec,
        dtSec: system.dtSec,
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Failed to run simulation");
      setData(null);
      setPlaybackConfig(null);
    } finally {
      setIsComputing(false);
    }
  }, [system, isComputing]);

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

  const handleCanvasClick = useCallback(
    (evt: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      if (!placementMode) return;
      const bounds = evt.currentTarget.getBoundingClientRect();
      const xPx = evt.clientX - bounds.left;
      const yPx = evt.clientY - bounds.top;
      const center = 250;
      const simX = (xPx - center) / renderScale;
      const simY = (yPx - center) / renderScale;
      if (!Number.isFinite(simX) || !Number.isFinite(simY)) return;
      const distance = Math.sqrt(simX * simX + simY * simY) || 0.1;
      const name = makeUniqueName(customBody.name);
      const placed: BodyTemplate = {
        ...customBody,
        name,
        aAU: distance,
        position: [simX, simY, 0],
      };
      setPendingPlanet(placed);
      fetchTrajectoryPreview(placed);
    },
    [placementMode, renderScale, customBody, makeUniqueName, fetchTrajectoryPreview]
  );

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
        <h2>Premade Bodies</h2>
        <p>
          Select bodies to include in your system. Each selection adds a preset
          with mass, color, and radius.
        </p>
        <div
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {BODY_CATALOG.map((body) => (
            <div
              key={body.name}
              style={{
                border: "1px solid #333",
                borderRadius: 8,
                padding: 12,
                background: "#1b1b1b",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong>{body.name}</strong>
                <div style={{ fontSize: 12, color: "#bbb" }}>
                  {body.kind === "rocky" ? "Rocky world" : "Gas giant"}
                </div>
                <div style={{ fontSize: 12 }}>
                  Radius: {body.radius}px • Mass:{" "}
                  {body.mass.toFixed(2)} u
                </div>
              </div>
              <button onClick={() => addBodyToSystem(body)}>Add</button>
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: 24 }}>Selected Bodies</h3>
        {system.planets.length === 0 && (
          <p>No bodies yet. Add from the list above.</p>
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

        <div style={{ marginTop: 24 }}>
          <label style={{ display: "block", marginBottom: 8 }}>
            Duration (seconds)
            <input
              type="number"
              min={1}
              value={system.durationSec}
              onChange={(e) =>
                handleSystemChange(
                  "durationSec",
                  parseFloat(e.target.value)
                )
              }
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <label style={{ display: "block", marginBottom: 16 }}>
            Sample Rate (dt seconds)
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={system.dtSec}
              onChange={(e) =>
                handleSystemChange(
                  "dtSec",
                  parseFloat(e.target.value)
                )
              }
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <button
            onClick={fetchCompute}
            disabled={!system.planets.length || isComputing}
          >
            {isComputing ? "Simulating..." : "Simulate"}
          </button>
          {error && (
            <p style={{ color: "salmon", marginTop: 8 }}>{error}</p>
          )}
        </div>

        {playbackConfig && (
          <div style={{ marginTop: 16, fontSize: 12, color: "#aaa" }}>
            <div>
              Last simulation: duration {playbackConfig.durationSec}s,
              dt {playbackConfig.dtSec}s
            </div>
          </div>
        )}

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
          onClick={handleCanvasClick}
        >
          <circle cx={250} cy={250} r={10} fill="yellow" />
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
