import React from "react";
import { BodyTemplate } from "../types";

interface PlanetListProps {
  planets: BodyTemplate[];
  selectedPlanetName: string | null;
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
}

export const PlanetList: React.FC<PlanetListProps> = ({
  planets,
  selectedPlanetName,
  onSelect,
  onRemove,
}) => {
  if (planets.length === 0) {
    return (
      <p className="app-section__empty-text">
        No planets yet. Create one above and drag it into position.
      </p>
    );
  }

  return (
    <div className="planet-list">
      {planets.map((planet, index) => (
        <div
          key={planet.name}
          onClick={() => onSelect(index)}
          className={`planet-list__item ${
            selectedPlanetName === planet.name ? "planet-list__item--selected" : ""
          }`}
        >
          <div className="planet-list__info">
            <div className="planet-list__header">
              <span
                className="planet-list__dot"
                style={{ backgroundColor: planet.color }}
              />
              <strong className="planet-list__name">{planet.name}</strong>
              <span className="planet-list__kind">{planet.kind}</span>
            </div>
            <div className="planet-list__details">
              Orbit: {planet.aAU.toFixed(2)} AU
              {planet.ellipticity > 0 && ` • Ellipticity: ${planet.ellipticity.toFixed(2)}`}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(index);
            }}
            className="planet-list__remove-button"
            title="Remove planet"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
