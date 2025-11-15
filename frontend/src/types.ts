export type BodyTemplate = {
  name: string;
  kind: "rocky" | "gas";
  aAU: number;
  mass: number;
  color: string;
  radius: number;
  position?: [number, number, number];
  velocity?: [number, number, number];
};

export type SystemPreset = {
  star: { massMs: number };
  planets: BodyTemplate[];
  durationSec: number;
  dtSec: number;
  musicMode: "per_orbit_note" | "continuous_tone";
};

export type CustomBodyConfig = Pick<BodyTemplate, "kind" | "color" | "radius">;

export type Planet = {
  name: string;
  kind: "rocky" | "gas";
  aAU: number;
  mass?: number;
  color?: string;
  radius?: number;
  x: number;
  y: number;
  position?: [number, number, number];
  velocity?: [number, number, number];
};

export type Sample = {
  t: number;
  planets: Planet[];
};

export type Event = {
  t: number;
  type: "note_on" | "note_off";
  planet: string;
  midi?: number;
  vel?: number;
  instrument?: string;
};

export type ComputeResponse = {
  samples: Sample[];
  events: Event[];
  meta: { dtSec: number; musicMode: string };
};
