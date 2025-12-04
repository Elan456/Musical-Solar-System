import React from "react";
import { Planet, BodyTemplate } from "../types";

const CANVAS_SIZE = 500;
const CANVAS_CENTER = CANVAS_SIZE / 2;
const RENDER_SCALE = 500 / 2;

export const getSimulationCoordinates = (
  evt: React.MouseEvent<SVGSVGElement>
): { simX: number; simY: number } | null => {
  const bounds = evt.currentTarget.getBoundingClientRect();
  const xPx = evt.clientX - bounds.left;
  const yPx = evt.clientY - bounds.top;
  const simX = (xPx - CANVAS_CENTER) / RENDER_SCALE;
  const simY = (yPx - CANVAS_CENTER) / RENDER_SCALE;
  if (!Number.isFinite(simX) || !Number.isFinite(simY)) return null;
  return { simX, simY };
};

export const findPlanetAtPosition = (
  evt: React.MouseEvent<SVGSVGElement>,
  currentSample: { planets: Planet[] } | null,
  systemPlanets: BodyTemplate[]
): number | null => {
  if (!currentSample?.planets) return null;

  const bounds = evt.currentTarget.getBoundingClientRect();
  const xPx = evt.clientX - bounds.left;
  const yPx = evt.clientY - bounds.top;

  for (let i = currentSample.planets.length - 1; i >= 0; i--) {
    const planet = currentSample.planets[i];
    const px = CANVAS_CENTER + (planet.x || 0) * RENDER_SCALE;
    const py = CANVAS_CENTER + (planet.y || 0) * RENDER_SCALE;
    const radius = (planet.radius ?? 6) + 4;
    const dx = xPx - px;
    const dy = yPx - py;
    if (dx * dx + dy * dy <= radius * radius) {
      const idx = systemPlanets.findIndex((p) => p.name === planet.name);
      return idx >= 0 ? idx : null;
    }
  }
  return null;
};
