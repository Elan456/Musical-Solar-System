import { BodyTemplate, CustomBodyConfig } from "../types";

const DEFAULT_PLANET_COLORS: Record<CustomBodyConfig["kind"], string> = {
  rocky: "#a0a0a0",
  gas: "#4af4ff",
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const hslToHex = (h: number, s: number, l: number): string => {
  const sat = clamp01(s / 100);
  const light = clamp01(l / 100);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
  } else if (h >= 120 && h < 180) {
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (channel: number) => Math.round((channel + m) * 255)
    .toString(16)
    .padStart(2, "0");

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export const getRandomPlanetColor = (kind: CustomBodyConfig["kind"]): string => {
  let hue: number;

  if (kind === "gas") {
    // Gas giants: cyans, blues, purples (180-280°)
    const hueRange = [180, 280];
    hue = hueRange[0] + Math.random() * (hueRange[1] - hueRange[0]);
  } else {
    // Rocky planets: include reds, oranges, yellows, greens, and blues
    // Choose from multiple color ranges to get better variety
    const colorRanges = [
      [10, 70],    // reds, oranges, yellows
      [110, 150],  // greens
      [200, 260],  // blues
    ];
    const selectedRange = colorRanges[Math.floor(Math.random() * colorRanges.length)];
    hue = selectedRange[0] + Math.random() * (selectedRange[1] - selectedRange[0]);
  }

  const saturation = 58 + Math.random() * 18;
  const lightness = (kind === "gas" ? 55 : 48) + Math.random() * 10;
  return hslToHex(hue, saturation, lightness);
};

export const getRandomPlanetRadius = (): number => {
  const min = 4;
  const max = 11;
  return Math.round(min + Math.random() * (max - min));
};

export const getRandomPlanetVisuals = (kind: CustomBodyConfig["kind"]): { color: string; radius: number } => ({
  color: getRandomPlanetColor(kind),
  radius: getRandomPlanetRadius(),
});

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
