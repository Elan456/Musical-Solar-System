import { useState, useCallback, useEffect, useRef } from "react";
import { BodyTemplate, CustomBodyConfig, ComputeResponse } from "../types";
import { computeMassFromConfig, getRandomPlanetVisuals, makeUniquePlanetName } from "../utils/planetHelpers";

const API = "http://localhost:8000/api";

interface UsePlanetManagementOptions {
  buildSimulationPayload: (planetsOverride?: BodyTemplate[]) => any;
}

interface UsePlanetManagementResult {
  selectedPlanetName: string | null;
  customBody: CustomBodyConfig;
  trajectory: { planetName: string; points: { x: number; y: number }[] } | null;
  predicting: boolean;
  setSelectedPlanetName: (name: string | null) => void;
  setCustomBody: (cfg: CustomBodyConfig) => void;
  setTrajectory: (traj: { planetName: string; points: { x: number; y: number }[] } | null) => void;
  syncCustomBodyToPlanet: (planet: BodyTemplate) => void;
  computeTrajectoryPreview: (planet: BodyTemplate, planets: BodyTemplate[]) => Promise<void>;
  handleSpawnPlanet: (planets: BodyTemplate[]) => BodyTemplate;
  handleCustomBodyChange: (cfg: CustomBodyConfig, planets: BodyTemplate[], isDragging: boolean) => {
    updatedPlanets: BodyTemplate[];
    newSelectedName: string | null;
    shouldComputeTrajectory: boolean;
    updatedPlanet: BodyTemplate | null;
  };
  previewRequestRef: React.MutableRefObject<number>;
}

export const usePlanetManagement = (
  options: UsePlanetManagementOptions
): UsePlanetManagementResult => {
  const buildInitialCustomBody = () => {
    const visuals = getRandomPlanetVisuals("rocky");
    return {
      kind: "rocky" as const,
      color: visuals.color,
      radius: visuals.radius,
      ellipticity: 0,
    };
  };

  const [selectedPlanetName, setSelectedPlanetName] = useState<string | null>(null);
  const [customBody, setCustomBody] = useState<CustomBodyConfig>(buildInitialCustomBody);
  const [trajectory, setTrajectory] = useState<{
    planetName: string;
    points: { x: number; y: number }[];
  } | null>(null);
  const [predicting, setPredicting] = useState(false);
  const previewRequestRef = useRef(0);

  const syncCustomBodyToPlanet = useCallback((planet: BodyTemplate) => {
    const fallbackVisuals = getRandomPlanetVisuals(planet.kind);
    setCustomBody({
      kind: planet.kind,
      color: planet.color ?? fallbackVisuals.color,
      radius: planet.radius ?? fallbackVisuals.radius,
      ellipticity: planet.ellipticity ?? 0,
    });
  }, []);

  const computeTrajectoryPreview = useCallback(
    async (planet: BodyTemplate, planets: BodyTemplate[]) => {
      const requestId = ++previewRequestRef.current;
      setPredicting(true);

      try {
        const idx = planets.findIndex((p) => p.name === planet.name);
        const overridePlanets =
          idx === -1
            ? [...planets, planet]
            : planets.map((p, i) => (i === idx ? { ...planet } : { ...p }));

        const payload = {
          ...options.buildSimulationPayload(overridePlanets),
          trajectoryOnly: true,
        };
        const res = await fetch(`${API}/compute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error(`Server responded with ${res.status}`);

        const json: ComputeResponse = await res.json();
        if (previewRequestRef.current !== requestId) return;

        const planetIdx = json.planetMetadata?.findIndex((p) => p.name === planet.name) ?? -1;
        const points =
          planetIdx >= 0
            ? json.samples
                ?.map((sample) => sample.positions?.[planetIdx])
                .filter((pos): pos is [number, number] => Array.isArray(pos))
                .map((pos) => ({ x: pos[0], y: pos[1] }))
            : [];

        setTrajectory({ planetName: planet.name, points });
      } catch (err) {
        console.error("Failed to compute trajectory preview", err);
      } finally {
        if (previewRequestRef.current === requestId) setPredicting(false);
      }
    },
    [options]
  );

  const handleSpawnPlanet = useCallback(
    (planets: BodyTemplate[]): BodyTemplate => {
      const visuals = getRandomPlanetVisuals(customBody.kind);
      const planetConfig = { ...customBody, ...visuals };
      const baseName = customBody.kind === "gas" ? "Gas Giant" : "Rocky Body";
      const name = makeUniquePlanetName(baseName, planets);
      const mass = computeMassFromConfig(planetConfig);
      const orbit = 0.3 + (planets.length * 0.12) % 0.6;

      const newPlanet: BodyTemplate = {
        name,
        kind: planetConfig.kind,
        color: planetConfig.color,
        radius: planetConfig.radius,
        ellipticity: planetConfig.ellipticity,
        mass,
        aAU: orbit,
        position: [orbit, 0, 0],
      };

      return newPlanet;
    },
    [customBody]
  );

  const handleCustomBodyChange = useCallback(
    (cfg: CustomBodyConfig, planets: BodyTemplate[], isDragging: boolean) => {
      setCustomBody(cfg);
      if (!selectedPlanetName) {
        return {
          updatedPlanets: planets,
          newSelectedName: null,
          shouldComputeTrajectory: false,
          updatedPlanet: null,
        };
      }

      const currentPlanet = planets.find((p) => p.name === selectedPlanetName);

      const onlyColorChanged =
        currentPlanet &&
        currentPlanet.kind === cfg.kind &&
        currentPlanet.radius === cfg.radius &&
        currentPlanet.ellipticity === cfg.ellipticity;

      const typeChanged = currentPlanet && currentPlanet.kind !== cfg.kind;
      const mass = computeMassFromConfig(cfg);
      let updatedPlanet: BodyTemplate | null = null;
      let newName: string | null = null;

      const updatedPlanets = planets.map((planet) => {
        if (planet.name !== selectedPlanetName) return planet;

        let name = planet.name;
        if (typeChanged) {
          const baseName = cfg.kind === "gas" ? "Gas Giant" : "Rocky Body";
          const match = planet.name.match(/(\d+)$/);
          if (match) {
            const num = match[1];
            const candidate = `${baseName} ${num}`;
            const existing = new Set(planets.map((p) => p.name));
            existing.delete(planet.name);
            if (!existing.has(candidate)) {
              name = candidate;
            } else {
              name = makeUniquePlanetName(baseName, planets);
            }
          } else {
            name = makeUniquePlanetName(baseName, planets);
          }
          newName = name;
        }

        const next: BodyTemplate = { ...planet, ...cfg, mass, name };
        updatedPlanet = next;
        return next;
      });

      return {
        updatedPlanets,
        newSelectedName: newName,
        shouldComputeTrajectory: !isDragging && !onlyColorChanged,
        updatedPlanet,
      };
    },
    [selectedPlanetName]
  );

  return {
    selectedPlanetName,
    customBody,
    trajectory,
    predicting,
    setSelectedPlanetName,
    setCustomBody,
    setTrajectory,
    syncCustomBodyToPlanet,
    computeTrajectoryPreview,
    handleSpawnPlanet,
    handleCustomBodyChange,
    previewRequestRef,
  };
};
