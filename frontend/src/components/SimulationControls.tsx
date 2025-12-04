import React from "react";

interface SimulationControlsProps {
  canPlay: boolean;
  canPause: boolean;
  canReset: boolean;
  playhead: number;
  totalDuration: number;
  progress: number;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  canPlay,
  canPause,
  canReset,
  playhead,
  totalDuration,
  progress,
  onPlay,
  onPause,
  onReset,
}) => {
  return (
    <>
      <div className="simulation-controls">
        <button
          onClick={onPlay}
          disabled={!canPlay}
          className={`simulation-controls__button ${canPlay ? "simulation-controls__button--play" : ""}`}
        >
          ▶ Play
        </button>
        <button
          onClick={onPause}
          disabled={!canPause}
          className="simulation-controls__button"
        >
          ⏸ Pause
        </button>
        <button
          onClick={onReset}
          disabled={!canReset}
          className="simulation-controls__button"
        >
          ↺ Reset
        </button>
        <div className="simulation-controls__time-display">
          <span className="simulation-controls__time-text">
            {playhead.toFixed(1)}s / {totalDuration.toFixed(1)}s
          </span>
        </div>
      </div>

      <div className="simulation-progress">
        <div className="simulation-progress__bar" style={{ width: `${progress}%` }} />
      </div>
    </>
  );
};
