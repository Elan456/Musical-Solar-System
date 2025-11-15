import React from "react";
import { BodyTemplate } from "../types";

type CustomBodyPanelProps = {
  config: BodyTemplate;
  onChange: (cfg: BodyTemplate) => void;
  placementActive: boolean;
  onPlacementToggle: () => void;
  canCommit: boolean;
  onCommit: () => void;
  onClear: () => void;
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
  placementActive,
  onPlacementToggle,
  canCommit,
  onCommit,
  onClear,
  predicting,
}: CustomBodyPanelProps) {
  const update = (key: keyof BodyTemplate, value: any) => {
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
      <h3>Custom Body</h3>
      <p style={{ fontSize: 12, color: "#aaa" }}>
        Pick a color, radius, and low mass, then click "Start Placement" to drop it directly on the map.
      </p>
      <label style={labelStyle}>
        Name
        <input
          style={inputStyle}
          type="text"
          value={config.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Custom"
        />
      </label>
      <label style={labelStyle}>
        Type
        <select
          style={inputStyle}
          value={config.kind}
          onChange={(e) => update("kind", e.target.value as BodyTemplate["kind"])}
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
        Mass (u)
        <input
          style={inputStyle}
          type="range"
          min={0.05}
          max={5}
          step={0.05}
          value={config.mass}
          onChange={(e) => update("mass", parseFloat(e.target.value))}
        />
        <div style={{ fontSize: 12, color: "#bbb" }}>{config.mass.toFixed(2)} u</div>
      </label>
      <button onClick={onPlacementToggle} style={{ width: "100%", marginTop: 8 }}>
        {placementActive ? "Placement Active: Click on Sim" : "Start Placement"}
      </button>
      {canCommit && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onCommit} style={{ flex: 1 }}>
            Add To System
          </button>
          <button onClick={onClear} style={{ flex: 1 }}>
            Clear Preview
          </button>
        </div>
      )}
      {predicting && <p style={{ fontSize: 12, color: "#bbb", marginTop: 8 }}>Predicting trajectory…</p>}
      {!predicting && placementActive && !canCommit && (
        <p style={{ fontSize: 12, color: "#bbb", marginTop: 8 }}>Click anywhere on the sim to preview the path.</p>
      )}
    </div>
  );
}

export default CustomBodyPanel;
