import React from "react";
import { BodyTemplate, CustomBodyConfig } from "../types";
import CustomBodyPanel from "./CustomBodyPanel";
import { PlanetList } from "./PlanetList";

interface SidebarProps {
  customBody: CustomBodyConfig;
  selectedPlanetName: string | null;
  predicting: boolean;
  planets: BodyTemplate[];
  isComputing: boolean;
  error: string | null;
  onBodyConfigChange: (cfg: CustomBodyConfig) => void;
  onSpawnPlanet: () => void;
  onPlanetSelect: (index: number) => void;
  onPlanetRemove: (index: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  customBody,
  selectedPlanetName,
  predicting,
  planets,
  isComputing,
  error,
  onBodyConfigChange,
  onSpawnPlanet,
  onPlanetSelect,
  onPlanetRemove,
}) => {
  return (
    <aside className="app-sidebar">
      <section className="app-section">
        <h2 className="app-section__title">Create Planet</h2>
        <CustomBodyPanel
          config={customBody}
          onChange={onBodyConfigChange}
          selectedName={selectedPlanetName}
          onSpawn={onSpawnPlanet}
          hasPending={false}
          spawnPending={false}
          predicting={predicting}
        />
      </section>

      <section className="app-section">
        <h2 className="app-section__title">Planets ({planets.length})</h2>
        <PlanetList
          planets={planets}
          selectedPlanetName={selectedPlanetName}
          onSelect={onPlanetSelect}
          onRemove={onPlanetRemove}
        />
      </section>

      <div className="app-status">
        {isComputing && <span className="app-status--computing">⏳ Simulating...</span>}
        {error && <span className="app-status--error">{error}</span>}
      </div>
    </aside>
  );
};
