import React, { useState, useRef } from "react";
import { SystemPreset, ComputeResponse, Planet, BodyTemplate } from "./types";
import { playEvents, stopAll } from "./audio";

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

function App() {
  const [system, setSystem] = useState<SystemPreset>(defaultPreset);
  const [data, setData] = useState<ComputeResponse | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const rafRef = useRef<number | null>(null);

  const addBodyToSystem = (template: BodyTemplate) => {
    setSystem((prev) => {
      const duplicates = prev.planets.filter((p) => p.name.startsWith(template.name))
        .length;
      const suffix = duplicates ? ` ${duplicates + 1}` : "";
      const planet = { ...template, name: `${template.name}${suffix}` };
      return { ...prev, planets: [...prev.planets, planet] };
    });
  };

  const removePlanet = (index: number) => {
    setSystem((prev) => ({
      ...prev,
      planets: prev.planets.filter((_, i) => i !== index),
    }));
  };

  const fetchCompute = async () => {
    if (!system.planets.length) return;
    const res = await fetch(`${API}/compute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(system),
    });
    setData(await res.json());
    setPlayhead(0);
    stopAll();
  };

  const handlePlay = () => {
    if (!data) return;
    setPlaying(true);
    playEvents(data.events, () => setPlaying(false));
    let start = performance.now();
    const loop = (now: number) => {
      let t = ((now - start) / 1000) % system.durationSec;
      setPlayhead(t);
      if (playing) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const handlePause = () => {
    setPlaying(false);
    stopAll();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  };

  const handleReset = () => {
    setPlayhead(0);
    handlePause();
  };

  const handleSystemChange = (key: "durationSec" | "dtSec", value: number) => {
    if (!Number.isFinite(value)) return;
    setSystem((prev) => ({ ...prev, [key]: value }));
  };

  // TODO: Add planet editing UI
  // TODO: Add more controls

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 360, padding: 16, overflowY: "auto", background: "#111", color: "#f5f5f5" }}>
        <h2>Premade Bodies</h2>
        <p>Select bodies to include in your system. Each selection adds a preset with mass, color, and radius.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                  Radius: {body.radius}px • Mass: {body.mass.toFixed(2)} u
                </div>
              </div>
              <button onClick={() => addBodyToSystem(body)}>Add</button>
            </div>
          ))}
        </div>
        <h3 style={{ marginTop: 24 }}>Selected Bodies</h3>
        {system.planets.length === 0 && <p>No bodies yet. Add from the list above.</p>}
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
                Orbit: {planet.aAU} AU • Color: {planet.color}
              </div>
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
              onChange={(e) => handleSystemChange("durationSec", parseFloat(e.target.value))}
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
              onChange={(e) => handleSystemChange("dtSec", parseFloat(e.target.value))}
              style={{ width: "100%", marginTop: 4 }}
            />
          </label>
          <button onClick={fetchCompute} disabled={!system.planets.length}>
            Simulate
          </button>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 8, padding: 8 }}>
          <button onClick={handlePlay}>Play</button>
          <button onClick={handlePause}>Pause</button>
          <button onClick={handleReset}>Reset</button>
        </div>
        <svg width="500" height="500" style={{ background: "#222" }}>
          {/* Draw star at center */}
          <circle cx={250} cy={250} r={10} fill="yellow" />
          {/* Draw planets safely */}
          {data && Array.isArray(data.samples) && data.samples.length > 0 && (() => {
            const idx = Math.floor(playhead / system.dtSec) % data.samples.length;
            const sample = data.samples[idx];
            if (!sample || !Array.isArray(sample.planets)) return null;
            const maxOrbit = sample.planets.reduce((max, p) => Math.max(max, Math.abs(p.aAU ?? 0)), 1);
            const scale = maxOrbit > 0 ? 220 / maxOrbit : 100;
            return sample.planets.map((p: Planet) => {
              if (typeof p.x !== "number" || typeof p.y !== "number") return null;
              return (
                <circle
                  key={p.name}
                  cx={250 + p.x * scale}
                  cy={250 + p.y * scale}
                  r={p.radius ?? 6}
                  fill={p.color ?? (p.kind === "rocky" ? "#aaa" : "#4af")}
                />
              );
            });
          })()}
        </svg>
      </div>
    </div>
  );
}

export default App;
