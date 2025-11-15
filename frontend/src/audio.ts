import { Event } from "./types";

let ctx: AudioContext | null = null;
let oscillators: Record<string, OscillatorNode> = {};

function midiToFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function playEvents(events: Event[], onDone: () => void) {
  if (!ctx) ctx = new AudioContext();
  stopAll();
  events.forEach((e) => {
    if (e.type === "note_on" && e.midi !== undefined) {
      const osc = ctx.createOscillator();
      osc.frequency.value = midiToFreq(e.midi);
      osc.type = e.instrument === "mallet" ? "sine" : "triangle";
      osc.connect(ctx.destination);
      oscillators[e.planet] = osc;
      osc.start(ctx.currentTime + e.t);
      if (e.instrument === "mallet") {
        osc.stop(ctx.currentTime + e.t + 0.2);
      }
    }
    if (e.type === "note_off") {
      const osc = oscillators[e.planet];
      if (osc) osc.stop(ctx.currentTime + e.t);
    }
  });
  setTimeout(onDone, (events[events.length - 1]?.t || 0) * 1000 + 500);
}

export function stopAll() {
  Object.values(oscillators).forEach((osc) => {
    try {
      osc.stop();
    } catch {}
  });
  oscillators = {};
}
