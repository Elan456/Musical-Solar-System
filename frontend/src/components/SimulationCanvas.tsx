import React, { useMemo } from "react";
import { Planet, BodyTemplate } from "../types";

const CANVAS_SIZE = 500;
const CANVAS_CENTER = CANVAS_SIZE / 2;
const RENDER_SCALE = 500 / 2;

const DEFAULT_PLANET_COLORS: Record<string, string> = {
  rocky: "#a0a0a0",
  gas: "#4af4ff",
};

interface SimulationCanvasProps {
  currentSample: { planets: Planet[] } | null;
  trajectory: { planetName: string; points: { x: number; y: number }[] } | null;
  selectedPlanetName: string | null;
  draggingPlanetName: string | null;
  blinkingPlanets: Set<string>;
  systemPlanets: BodyTemplate[];
  planetVisuals: Record<string, { color: string; radius: number; kind: string }>;
  isDragging: boolean;
  onMouseDown: (evt: React.MouseEvent<SVGSVGElement>) => void;
  onMouseMove: (evt: React.MouseEvent<SVGSVGElement>) => void;
  onMouseUp: (evt: React.MouseEvent<SVGSVGElement>) => void;
  onMouseLeave: (evt: React.MouseEvent<SVGSVGElement>) => void;
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
  currentSample,
  trajectory,
  selectedPlanetName,
  draggingPlanetName,
  blinkingPlanets,
  systemPlanets,
  planetVisuals,
  isDragging,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
}) => {
  const backgroundStars = useMemo(() => {
    return [...Array(50)].map((_, i) => ({
      cx: (i * 37 + i * i * 7) % CANVAS_SIZE,
      cy: (i * 53 + i * i * 3) % CANVAS_SIZE,
      r: (i % 3 === 0) ? 1 : 0.5,
      opacity: 0.2 + (i % 5) * 0.1,
    }));
  }, []);

  const renderPlanets = () => {
    if (!currentSample?.planets) return null;

    const draggingTemplate = draggingPlanetName
      ? systemPlanets.find((p) => p.name === draggingPlanetName)
      : null;

    return currentSample.planets.map((p: Planet) => {
      let { x, y, name, radius } = p;
      if (typeof x !== "number" || typeof y !== "number") return null;

      if (name === "Star") return null;

      if (draggingTemplate?.name === name && draggingTemplate.position) {
        x = draggingTemplate.position[0];
        y = draggingTemplate.position[1];
      }

      const visuals = planetVisuals[name];
      const color = visuals?.color ?? DEFAULT_PLANET_COLORS.rocky;
      const displayRadius = visuals?.radius ?? radius ?? 6;

      const cx = CANVAS_CENTER + x * RENDER_SCALE;
      const cy = CANVAS_CENTER + y * RENDER_SCALE;
      const isSelected = name === selectedPlanetName;
      const isBlinking = blinkingPlanets.has(name);

      return (
        <g key={name}>
          {isSelected && (
            <circle
              cx={cx}
              cy={cy}
              r={displayRadius + 4}
              fill="none"
              stroke="#fff"
              strokeWidth={2}
              opacity={0.6}
            />
          )}
          {isBlinking && (
            <circle
              cx={cx}
              cy={cy}
              r={displayRadius + 8}
              fill="none"
              stroke="#ffffff"
              strokeWidth={3}
              opacity={0.8}
            />
          )}
          <circle
            cx={cx}
            cy={cy}
            r={displayRadius}
            fill={color}
            opacity={isBlinking ? 1 : 0.85}
            filter={isBlinking ? "brightness(1.5)" : undefined}
          />
        </g>
      );
    });
  };

  return (
    <svg
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className={`simulation-canvas ${isDragging ? "simulation-canvas--dragging" : ""}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {backgroundStars.map((star, i) => (
        <circle
          key={`star-${i}`}
          cx={star.cx}
          cy={star.cy}
          r={star.r}
          fill="#ffffff"
          opacity={star.opacity}
        />
      ))}

      <circle cx={CANVAS_CENTER} cy={CANVAS_CENTER} r={15} fill="#ffdd44" />
      <circle cx={CANVAS_CENTER} cy={CANVAS_CENTER} r={20} fill="#ffdd44" opacity={0.3} />
      <circle cx={CANVAS_CENTER} cy={CANVAS_CENTER} r={25} fill="#ffdd44" opacity={0.1} />

      {trajectory?.points?.length ? (
        <polyline
          points={trajectory.points
            .map((pt) => `${CANVAS_CENTER + pt.x * RENDER_SCALE},${CANVAS_CENTER + pt.y * RENDER_SCALE}`)
            .join(" ")}
          stroke="#6688ff"
          strokeDasharray="4 4"
          fill="none"
          opacity={0.6}
          strokeWidth={1.5}
        />
      ) : null}

      {renderPlanets()}
    </svg>
  );
};
