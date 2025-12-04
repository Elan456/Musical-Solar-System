import { BodyTemplate, CustomBodyConfig } from "../types";

const DEFAULT_PLANET_COLORS: Record<CustomBodyConfig["kind"], string> = {
  rocky: "#a0a0a0",
  gas: "#4af4ff",
};

export const getSimulationKey = (planets: BodyTemplate[]): string => {
  return JSON.stringify(
    planets.map((p) => ({
      name: p.name,
      mass: p.mass,
      aAU: p.aAU,
      radius: p.radius,
      ellipticity: p.ellipticity,
      position: p.position,
      kind: p.kind,
    }))
  );
};

export const computeMassFromConfig = (cfg: CustomBodyConfig): number => {
  const base = Math.max(cfg.radius, 1);
  const mass = cfg.kind === "gas" ? base * 0.006 : base * 0.003;
  return parseFloat(mass.toFixed(3));
};

export const ensurePlanetForPayload = (planet: BodyTemplate): BodyTemplate => {
  const kind = planet.kind ?? "rocky";
  const radius = planet.radius ?? 6;
  const color = planet.color ?? DEFAULT_PLANET_COLORS[kind];
  const ellipticity = planet.ellipticity ?? 0;
  const rawMass = (planet as any).mass;
  const mass =
    typeof rawMass === "number" && Number.isFinite(rawMass)
      ? rawMass
      : computeMassFromConfig({ kind, color, radius, ellipticity });
  return { ...planet, kind, radius, color, ellipticity, mass };
};

export const makeUniquePlanetName = (baseName: string, existingPlanets: BodyTemplate[]): string => {
  const sanitized = baseName.trim() || "Planet";
  const existing = new Set(existingPlanets.map((p) => p.name));
  if (!existing.has(sanitized)) return sanitized;
  let idx = 2;
  let candidate = `${sanitized} ${idx}`;
  while (existing.has(candidate)) {
    idx += 1;
    candidate = `${sanitized} ${idx}`;
  }
  return candidate;
};
