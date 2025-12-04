export type BodyTemplate = {
  name: string;
  kind: "rocky" | "gas";
  aAU: number;
  mass: number;
  color: string;
  radius: number;
  ellipticity?: number;
  position?: [number, number, number];
  velocity?: [number, number, number];
};

export type SystemPreset = {
  star: { massMs: number };
  planets: BodyTemplate[];
  durationSec: number;
  dtSec: number;
};

export type CustomBodyConfig = Pick<
  BodyTemplate,
  "kind" | "color" | "radius"
> & {
  ellipticity: number;
};

export type Planet = {
  name: string;
  kind: "rocky" | "gas" | "star";
  color: string;
  radius: number;
  x: number;
  y: number;
};

export type PlanetMetadata = {
  name: string;
  kind: "rocky" | "gas" | "star";
  color: string;
  radius: number;
  mass?: number;
  aAU?: number;
};

export type TrajectorySample = {
  t: number;
  positions: [number, number][];
};

export type Event = {
  t: number;
  type: "note_on" | "note_off";
  planet: string;
  midi?: number;
  vel?: number;
  instrument?: string;
  reverb?: number;
  velocityEnvelope?: { t: number; velocity: number }[];
  continuous?: boolean;
};

export type ComputeResponse = {
  planetMetadata: PlanetMetadata[];
  samples: TrajectorySample[];
  events: Event[];
  meta: { dtSec: number; musicMode?: string };
};
