import React, { useState, useRef } from "react";
import { SystemPreset, ComputeResponse, Planet } from "./types";
import { playEvents, stopAll } from "./audio";

const API = "http://localhost:8000/api";

const defaultPreset: SystemPreset = {
  star: { massMs: 1.0 },
  planets: [{ name: "Terra", kind: "rocky", aAU: 1.0 }],
  durationSec: 30,
  dtSec: 0.1,
  musicMode: "per_orbit_note",
};

function App() {
  const [system, setSystem] = useState<SystemPreset>(defaultPreset);
  const [data, setData] = useState<ComputeResponse | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const rafRef = useRef<number | null>(null);

  const fetchCompute = async () => {
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

  // TODO: Add planet editing UI
  // TODO: Add more controls

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ width: 300, padding: 16 }}>
        <h3>System Inputs</h3>
        {/* TODO: Inputs for planets, aAU, kind, musicMode, durationSec, dtSec */}
        <button onClick={fetchCompute}>Compute</button>
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
          {data && Array.isArray(data.samples) && data.samples.length > 0 && (
            (() => {
              const idx = Math.floor(playhead / system.dtSec) % data.samples.length;
              const sample = data.samples[idx];
              if (!sample || !Array.isArray(sample.planets)) return null;
              return sample.planets.map((p: Planet, i: number) => {
                if (typeof p.x !== "number" || typeof p.y !== "number") return null;
                const scale = 100;
                return (
                  <circle
                    key={p.name}
                    cx={250 + p.x * scale}
                    cy={250 + p.y * scale}
                    r={6}
                    fill={p.kind === "rocky" ? "#aaa" : "#4af"}
                  />
                );
              });
            })()
          )}
        </svg>
      </div>
    </div>
  );
}

export default App;
