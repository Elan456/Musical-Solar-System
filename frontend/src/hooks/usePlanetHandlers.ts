import { useCallback, useEffect } from "react";
import { BodyTemplate, CustomBodyConfig } from "../types";

interface UsePlanetHandlersOptions {
  systemPlanets: BodyTemplate[];
  selectedPlanetName: string | null;
  isDragging: boolean;
  setSystem: React.Dispatch<React.SetStateAction<any>>;
  setSelectedPlanetName: (name: string | null) => void;
  setTrajectory: (traj: any) => void;
  syncCustomBodyToPlanet: (planet: BodyTemplate) => void;
  computeTrajectoryPreview: (planet: BodyTemplate, planets: BodyTemplate[]) => Promise<void>;
  handleSpawnPlanet: (planets: BodyTemplate[]) => BodyTemplate;
  handleCustomBodyChange: (cfg: CustomBodyConfig, planets: BodyTemplate[], isDragging: boolean) => any;
  latestDraggedPlanetRef: React.MutableRefObject<BodyTemplate | null>;
}

export const usePlanetHandlers = ({
  systemPlanets,
  selectedPlanetName,
  isDragging,
  setSystem,
  setSelectedPlanetName,
  setTrajectory,
  syncCustomBodyToPlanet,
  computeTrajectoryPreview,
  handleSpawnPlanet,
  handleCustomBodyChange,
  latestDraggedPlanetRef,
}: UsePlanetHandlersOptions) => {
  const handlePlanetSelect = useCallback(
    (index: number) => {
      const planet = systemPlanets[index];
      if (!planet) return;
      setSelectedPlanetName(planet.name);
      syncCustomBodyToPlanet(planet);
      setTrajectory(null);
      latestDraggedPlanetRef.current = null;
    },
    [systemPlanets, syncCustomBodyToPlanet, setSelectedPlanetName, setTrajectory]
  );

  const handlePlanetRemove = useCallback(
    (index: number) => {
      setSystem((prev: any) => {
        if (index < 0 || index >= prev.planets.length) return prev;
        const removedName = prev.planets[index].name;
        setSelectedPlanetName((curr) => (curr === removedName ? null : curr));
        setTrajectory((curr) => (curr?.planetName === removedName ? null : curr));
        return { ...prev, planets: prev.planets.filter((_: any, i: number) => i !== index) };
      });
    },
    [setSelectedPlanetName, setTrajectory]
  );

  const handleSpawnPlanetClick = useCallback(() => {
    const newPlanet = handleSpawnPlanet(systemPlanets);
    setSystem((prev: any) => ({ ...prev, planets: [...prev.planets, newPlanet] }));
    setSelectedPlanetName(newPlanet.name);
    syncCustomBodyToPlanet(newPlanet);
    setTrajectory(null);
    computeTrajectoryPreview(newPlanet, [...systemPlanets, newPlanet]);
  }, [handleSpawnPlanet, systemPlanets, syncCustomBodyToPlanet, computeTrajectoryPreview, setSelectedPlanetName, setTrajectory]);

  const handleBodyConfigChange = useCallback(
    (cfg: CustomBodyConfig) => {
      const { updatedPlanets, newSelectedName, shouldComputeTrajectory, updatedPlanet } = handleCustomBodyChange(
        cfg,
        systemPlanets,
        isDragging
      );
      setSystem((prev: any) => ({ ...prev, planets: updatedPlanets }));
      if (newSelectedName) setSelectedPlanetName(newSelectedName);
      if (updatedPlanet && shouldComputeTrajectory) computeTrajectoryPreview(updatedPlanet, updatedPlanets);
    },
    [handleCustomBodyChange, systemPlanets, isDragging, setSelectedPlanetName, computeTrajectoryPreview]
  );

  useEffect(() => {
    if (!selectedPlanetName) return;
    const target = systemPlanets.find((p) => p.name === selectedPlanetName);
    if (target) syncCustomBodyToPlanet(target);
  }, [selectedPlanetName, systemPlanets, syncCustomBodyToPlanet]);

  return {
    handlePlanetSelect,
    handlePlanetRemove,
    handleSpawnPlanetClick,
    handleBodyConfigChange,
  };
};
