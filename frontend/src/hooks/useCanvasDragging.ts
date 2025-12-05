import { useState, useRef, useCallback } from "react";
import React from "react";
import { BodyTemplate } from "../types";
import { getSimulationCoordinates, findPlanetAtPosition } from "../utils/canvasHelpers";

interface UseCanvasDraggingResult {
  isDragging: boolean;
  draggingPlanetName: string | null;
  latestDraggedPlanetRef: React.MutableRefObject<BodyTemplate | null>;
  handleCanvasMouseDown: (
    evt: React.MouseEvent<SVGSVGElement>,
    currentSample: any,
    planets: BodyTemplate[],
    onSelect: (planet: BodyTemplate) => void
  ) => void;
  handleCanvasMouseMove: (
    evt: React.MouseEvent<SVGSVGElement>,
    onUpdate: (planetName: string, simX: number, simY: number, distance: number) => void
  ) => void;
  stopDragging: () => BodyTemplate | null;
}

export const useCanvasDragging = (): UseCanvasDraggingResult => {
  const [isDragging, setIsDragging] = useState(false);
  const [draggingPlanetName, setDraggingPlanetName] = useState<string | null>(null);
  const latestDraggedPlanetRef = useRef<BodyTemplate | null>(null);
  const dragEndTimeoutRef = useRef<number | null>(null);

  const handleCanvasMouseDown = useCallback(
    (
      evt: React.MouseEvent<SVGSVGElement>,
      currentSample: any,
      planets: BodyTemplate[],
      onSelect: (planet: BodyTemplate) => void
    ) => {
      // Clear any pending timeout
      if (dragEndTimeoutRef.current) {
        clearTimeout(dragEndTimeoutRef.current);
        dragEndTimeoutRef.current = null;
      }

      const index = findPlanetAtPosition(evt, currentSample, planets);
      if (index === null) return;

      const planet = planets[index];
      onSelect(planet);
      setDraggingPlanetName(planet.name);
      setIsDragging(true);
      latestDraggedPlanetRef.current = planet;
    },
    []
  );

  const handleCanvasMouseMove = useCallback(
    (
      evt: React.MouseEvent<SVGSVGElement>,
      onUpdate: (planetName: string, simX: number, simY: number, distance: number) => void
    ) => {
      if (!isDragging || !draggingPlanetName) return;
      const coords = getSimulationCoordinates(evt);
      if (!coords) return;

      const { simX, simY } = coords;
      const distance = Math.sqrt(simX * simX + simY * simY) || 0.01;

      onUpdate(draggingPlanetName, simX, simY, distance);
    },
    [isDragging, draggingPlanetName]
  );

  const stopDragging = useCallback(() => {
    if (!isDragging) return null;
    const finalPlanet = latestDraggedPlanetRef.current;
    setIsDragging(false);

    // Keep draggingPlanetName set for a short period to prevent snap-back
    // This allows the canvas to continue using the dragged position until simulation updates
    dragEndTimeoutRef.current = setTimeout(() => {
      setDraggingPlanetName(null);
      dragEndTimeoutRef.current = null;
    }, 100); // Short delay to bridge the gap until new simulation data arrives

    return finalPlanet;
  }, [isDragging]);

  return {
    isDragging,
    draggingPlanetName,
    latestDraggedPlanetRef,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    stopDragging,
  };
};
