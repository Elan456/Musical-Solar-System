import React from "react";
import { CustomBodyConfig } from "../types";

type CustomBodyPanelProps = {
  config: CustomBodyConfig;
  onChange: (cfg: CustomBodyConfig) => void;
  selectedName: string | null;
  onSpawn: () => void;
  hasPending: boolean;
  spawnPending: boolean;
  predicting: boolean;
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 4,
};

export function CustomBodyPanel({
  config,
  onChange,
  selectedName,
  onSpawn,
  hasPending,
  spawnPending,
  predicting,
}: CustomBodyPanelProps) {
  const update = (key: keyof CustomBodyConfig, value: any) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div
      style={{
        marginTop: 24,
        padding: 16,
        borderRadius: 8,
        border: "1px solid #333",
        background: "#181818",
      }}
    >
      <h3>Planet Editor</h3>
      <p style={{ fontSize: 12, color: "#aaa" }}>
        Drag planets directly inside the simulation to move them. These controls always edit the planet you last dragged.
      </p>
      <div style={{ fontSize: 12, color: "#ccc", marginBottom: 8 }}>
        Editing: {selectedName ?? "None — drag a planet to select it"}
      </div>
      <button
        onClick={onSpawn}
        style={{ width: "100%", marginBottom: 12 }}
        disabled={hasPending}
      >
        Spawn New Planet
      </button>
      {spawnPending && !hasPending && (
        <p style={{ fontSize: 12, color: "#bbb", marginTop: -4, marginBottom: 12 }}>
          Click and drag on the sim to place the new planet.
        </p>
      )}
      <label style={labelStyle}>
        Type
        <select
          style={inputStyle}
          value={config.kind}
          onChange={(e) =>
            update("kind", e.target.value as CustomBodyConfig["kind"])
          }
        >
          <option value="rocky">Rocky</option>
          <option value="gas">Gas</option>
        </select>
      </label>
      <label style={labelStyle}>
        Color
        <input
          style={inputStyle}
          type="color"
          value={config.color}
          onChange={(e) => update("color", e.target.value)}
        />
      </label>
      <label style={labelStyle}>
        Radius (px)
        <input
          style={inputStyle}
          type="range"
          min={2}
          max={12}
          value={config.radius}
          onChange={(e) => update("radius", parseInt(e.target.value, 10))}
        />
      </label>
      <label style={labelStyle}>
        Orbit Ellipticity
        <input
          style={inputStyle}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={config.ellipticity}
          onChange={(e) => update("ellipticity", parseFloat(e.target.value))}
        />
        <span style={{ fontSize: 11, color: "#888" }}>
          0 is circular, drag right for a more stretched orbit.
        </span>
      </label>
      {predicting && <p style={{ fontSize: 12, color: "#bbb", marginTop: 8 }}>Predicting trajectory…</p>}
      {!predicting && hasPending && (
        <p style={{ fontSize: 12, color: "#bbb", marginTop: 8 }}>
          Dragging… release to drop the planet. You'll see the estimated path while moving.
        </p>
      )}
    </div>
  );
}

export default CustomBodyPanel;
