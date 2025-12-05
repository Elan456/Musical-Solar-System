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
  clearDraggingPlanetName: () => void;
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

    // Don't automatically clear draggingPlanetName here - keep planet at dragged position
    // until new simulation data arrives. This prevents snap-back behavior.
    // The caller is responsible for clearing draggingPlanetName when simulation completes.

    return finalPlanet;
  }, [isDragging]);

  const clearDraggingPlanetName = useCallback(() => {
    // Clear any pending timeout
    if (dragEndTimeoutRef.current) {
      clearTimeout(dragEndTimeoutRef.current);
      dragEndTimeoutRef.current = null;
    }
    setDraggingPlanetName(null);
  }, []);

  return {
    isDragging,
    draggingPlanetName,
    latestDraggedPlanetRef,
    handleCanvasMouseDown,
    handleCanvasMouseMove,
    stopDragging,
    clearDraggingPlanetName,
  };
};
