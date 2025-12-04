import React from "react";
import { CustomBodyConfig } from "../types";
import "./CustomBodyPanel.css";

type CustomBodyPanelProps = {
  config: CustomBodyConfig;
  onChange: (cfg: CustomBodyConfig) => void;
  selectedName: string | null;
  onSpawn: () => void;
  hasPending: boolean;
  spawnPending: boolean;
  predicting: boolean;
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

  const isEditing = selectedName !== null;

  return (
    <div className="custom-body-panel">
      <h3 className="custom-body-panel__title">
        <span>🌍</span> Planet Builder
      </h3>
      <p className="custom-body-panel__description">
        Create awesome planets and customize their orbits! Drag them around to change their path.
      </p>

      <div
        className={`custom-body-panel__status-box ${
          isEditing ? "custom-body-panel__status-box--editing" : "custom-body-panel__status-box--none"
        }`}
      >
        <span>{isEditing ? "✏️" : "👆"}</span>
        {isEditing ? (
          <>
            Editing: <strong>{selectedName}</strong>
          </>
        ) : (
          "Click a planet in the simulation to edit it"
        )}
      </div>

      <button
        onClick={onSpawn}
        className={`custom-body-panel__spawn-button ${hasPending ? "custom-body-panel__spawn-button:disabled" : ""}`}
        disabled={hasPending}
      >
        ➕ Create New Planet
      </button>

      {spawnPending && !hasPending && (
        <p className="custom-body-panel__spawn-hint">✨ Click and drag on the simulation to place your planet!</p>
      )}

      <hr className="custom-body-panel__divider" />

      <div className="custom-body-panel__control-group">
        <label className="custom-body-panel__label">🪨 Planet Type</label>
        <select
          className="custom-body-panel__select"
          value={config.kind}
          onChange={(e) => update("kind", e.target.value as CustomBodyConfig["kind"])}
        >
          <option value="rocky">🌍 Rocky Planet</option>
          <option value="gas">🌀 Gas Giant</option>
        </select>
      </div>

      <div className="custom-body-panel__control-group">
        <label className="custom-body-panel__label">🎨 Planet Color</label>
        <div className="custom-body-panel__color-input-container">
          <input
            className="custom-body-panel__color-input"
            type="color"
            value={config.color}
            onChange={(e) => update("color", e.target.value)}
          />
          <span className="custom-body-panel__color-value">{config.color}</span>
        </div>
      </div>

      <div className="custom-body-panel__control-group">
        <label className="custom-body-panel__label">
          📏 Size <span className="custom-body-panel__range-value">{config.radius}px</span>
        </label>
        <div className="custom-body-panel__range-container">
          <input
            className="custom-body-panel__range-input"
            type="range"
            min={2}
            max={12}
            value={config.radius}
            onChange={(e) => update("radius", parseInt(e.target.value, 10))}
          />
          <div className="custom-body-panel__range-labels">
            <span>Tiny</span>
            <span>Huge</span>
          </div>
        </div>
      </div>

      <div className="custom-body-panel__control-group">
        <label className="custom-body-panel__label">
          🌊 Orbit Shape <span className="custom-body-panel__range-value">{config.ellipticity.toFixed(2)}</span>
        </label>
        <div className="custom-body-panel__range-container">
          <input
            className="custom-body-panel__range-input"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.ellipticity}
            onChange={(e) => update("ellipticity", parseFloat(e.target.value))}
          />
          <div className="custom-body-panel__range-labels">
            <span>⭕ Circle</span>
            <span>🏉 Oval</span>
          </div>
        </div>
        <p className="custom-body-panel__hint">Lower = circular orbit • Higher = stretched oval orbit</p>
      </div>

      {predicting && <div className="custom-body-panel__status-message">🔮 Calculating orbit path...</div>}
      {!predicting && hasPending && <div className="custom-body-panel__status-message">🎯 Drag to position... Release to drop!</div>}
    </div>
  );
}

export default CustomBodyPanel;
