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

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: 20,
    borderRadius: 12,
    border: "2px solid #2244aa",
    background: "linear-gradient(135deg, #14141f 0%, #1a1a2e 100%)",
    boxShadow: "0 4px 16px rgba(34, 68, 170, 0.2)",
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: "#ffffff",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  description: {
    fontSize: 12,
    color: "#999",
    marginBottom: 16,
    lineHeight: 1.5,
  },
  statusBox: {
    padding: "10px 14px",
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
    fontWeight: 500,
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  statusEditing: {
    backgroundColor: "rgba(68, 102, 204, 0.15)",
    borderColor: "#4466cc",
    color: "#88aaff",
  },
  statusNone: {
    backgroundColor: "rgba(85, 85, 85, 0.15)",
    borderColor: "#333",
    color: "#888",
  },
  spawnButton: {
    width: "100%",
    padding: "14px 20px",
    fontSize: 15,
    fontWeight: 600,
    border: "2px solid #44cc88",
    borderRadius: 10,
    backgroundColor: "#2a8a5a",
    color: "#ffffff",
    cursor: "pointer",
    transition: "all 0.2s ease",
    marginBottom: 12,
    boxShadow: "0 2px 8px rgba(68, 204, 136, 0.3)",
  },
  spawnButtonDisabled: {
    backgroundColor: "#1a1a2e",
    borderColor: "#333",
    color: "#666",
    cursor: "not-allowed",
    boxShadow: "none",
  },
  spawnHint: {
    fontSize: 12,
    color: "#66dd99",
    marginTop: -4,
    marginBottom: 16,
    textAlign: "center",
    fontWeight: 500,
  },
  controlGroup: {
    marginBottom: 20,
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#ccc",
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  select: {
    width: "100%",
    padding: "10px 12px",
    fontSize: 14,
    border: "1px solid #333",
    borderRadius: 8,
    backgroundColor: "#0d0d14",
    color: "#fff",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  colorInputContainer: {
    position: "relative",
    width: "100%",
  },
  colorInput: {
    width: "100%",
    height: 50,
    border: "2px solid #333",
    borderRadius: 8,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  colorValue: {
    position: "absolute",
    bottom: -20,
    right: 0,
    fontSize: 11,
    color: "#666",
    fontFamily: "monospace",
  },
  rangeContainer: {
    position: "relative",
    paddingBottom: 8,
  },
  rangeInput: {
    width: "100%",
    height: 6,
    cursor: "pointer",
    accentColor: "#4466cc",
  },
  rangeLabels: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 8,
    fontSize: 11,
    color: "#666",
  },
  rangeValue: {
    display: "inline-block",
    backgroundColor: "#2244aa",
    color: "#fff",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    marginLeft: 8,
  },
  hint: {
    fontSize: 11,
    color: "#777",
    marginTop: 6,
    fontStyle: "italic",
  },
  statusMessage: {
    fontSize: 12,
    color: "#88aaff",
    marginTop: 12,
    padding: "8px 12px",
    backgroundColor: "rgba(68, 102, 204, 0.15)",
    borderRadius: 6,
    textAlign: "center",
    fontWeight: 500,
  },
  divider: {
    height: 1,
    backgroundColor: "#2a2a3e",
    margin: "20px 0",
    border: "none",
  },
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
    <div style={styles.container}>
      <h3 style={styles.title}>
        <span>🌍</span> Planet Builder
      </h3>
      <p style={styles.description}>
        Create awesome planets and customize their orbits! Drag them around to change their path.
      </p>

      <div style={{
        ...styles.statusBox,
        ...(isEditing ? styles.statusEditing : styles.statusNone)
      }}>
        <span>{isEditing ? "✏️" : "👆"}</span>
        {isEditing ? (
          <>Editing: <strong>{selectedName}</strong></>
        ) : (
          "Click a planet in the simulation to edit it"
        )}
      </div>

      <button
        onClick={onSpawn}
        style={{
          ...styles.spawnButton,
          ...(hasPending ? styles.spawnButtonDisabled : {}),
        }}
        disabled={hasPending}
        onMouseEnter={(e) => {
          if (!hasPending) {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(68, 204, 136, 0.4)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = hasPending ? "none" : "0 2px 8px rgba(68, 204, 136, 0.3)";
        }}
      >
        ➕ Create New Planet
      </button>

      {spawnPending && !hasPending && (
        <p style={styles.spawnHint}>
          ✨ Click and drag on the simulation to place your planet!
        </p>
      )}

      <hr style={styles.divider} />

      <div style={styles.controlGroup}>
        <label style={styles.label}>
          🪨 Planet Type
        </label>
        <select
          style={styles.select}
          value={config.kind}
          onChange={(e) =>
            update("kind", e.target.value as CustomBodyConfig["kind"])
          }
          onFocus={(e) => e.currentTarget.style.borderColor = "#4466cc"}
          onBlur={(e) => e.currentTarget.style.borderColor = "#333"}
        >
          <option value="rocky">🌍 Rocky Planet</option>
          <option value="gas">🌀 Gas Giant</option>
        </select>
      </div>

      <div style={styles.controlGroup}>
        <label style={styles.label}>
          🎨 Planet Color
        </label>
        <div style={styles.colorInputContainer}>
          <input
            style={styles.colorInput}
            type="color"
            value={config.color}
            onChange={(e) => update("color", e.target.value)}
            onFocus={(e) => e.currentTarget.style.borderColor = "#4466cc"}
            onBlur={(e) => e.currentTarget.style.borderColor = "#333"}
          />
          <span style={styles.colorValue}>{config.color}</span>
        </div>
      </div>

      <div style={styles.controlGroup}>
        <label style={styles.label}>
          📏 Size <span style={styles.rangeValue}>{config.radius}px</span>
        </label>
        <div style={styles.rangeContainer}>
          <input
            style={styles.rangeInput}
            type="range"
            min={2}
            max={12}
            value={config.radius}
            onChange={(e) => update("radius", parseInt(e.target.value, 10))}
          />
          <div style={styles.rangeLabels}>
            <span>Tiny</span>
            <span>Huge</span>
          </div>
        </div>
      </div>

      <div style={styles.controlGroup}>
        <label style={styles.label}>
          🌊 Orbit Shape <span style={styles.rangeValue}>{config.ellipticity.toFixed(2)}</span>
        </label>
        <div style={styles.rangeContainer}>
          <input
            style={styles.rangeInput}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={config.ellipticity}
            onChange={(e) => update("ellipticity", parseFloat(e.target.value))}
          />
          <div style={styles.rangeLabels}>
            <span>⭕ Circle</span>
            <span>🏉 Oval</span>
          </div>
        </div>
        <p style={styles.hint}>
          Lower = circular orbit • Higher = stretched oval orbit
        </p>
      </div>

      {predicting && (
        <div style={styles.statusMessage}>
          🔮 Calculating orbit path...
        </div>
      )}
      {!predicting && hasPending && (
        <div style={styles.statusMessage}>
          🎯 Drag to position... Release to drop!
        </div>
      )}
    </div>
  );
}

export default CustomBodyPanel;
