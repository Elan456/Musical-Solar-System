// audio.ts
import { Event } from "./types";

let ctx: AudioContext | null = null;

// All active oscillators, for hard stop
let allOscillators = new Set<OscillatorNode>();

// Per planet queue of oscillators, so multiple notes per planet work
let oscillatorsByPlanet: Record<string, OscillatorNode[]> = {};

let stopTimer: number | null = null;

function midiToFreq(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function clearStopTimer() {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
}

export function stopAll() {
  // Stop every oscillator immediately
  allOscillators.forEach((osc) => {
    try {
      osc.stop();
    } catch {
      // ignore already stopped
    }
  });
  allOscillators.clear();
  oscillatorsByPlanet = {};
  clearStopTimer();
}

export function playEvents(events: Event[], onDone: () => void) {
  if (!events?.length) {
    onDone();
    return;
  }
  if (!ctx) ctx = new AudioContext();

  // Stop anything from previous runs
  stopAll();

  events.forEach((e) => {
    if (e.type === "note_on" && e.midi !== undefined) {
      const osc = ctx!.createOscillator();
      osc.frequency.value = midiToFreq(e.midi);
      osc.type = e.instrument === "mallet" ? "sine" : "triangle";
      osc.connect(ctx!.destination);

      // Track this oscillator globally and per planet
      allOscillators.add(osc);
      const bucket = (oscillatorsByPlanet[e.planet] ||= []);
      bucket.push(osc);

      // When the oscillator finishes naturally, remove it from the global set
      osc.onended = () => {
        allOscillators.delete(osc);
      };

      osc.start(ctx!.currentTime + (e.t || 0));
    }

    if (e.type === "note_off") {
      const bucket = oscillatorsByPlanet[e.planet];
      if (bucket && bucket.length > 0) {
        // Match this off event to the oldest unmatched note_on for this planet
        const osc = bucket.shift()!;
        try {
          osc.stop(ctx!.currentTime + (e.t || 0));
        } catch {
          // already stopped, ignore
        }
      }
    }
  });

  const lastTime = events.reduce(
    (max, e) => Math.max(max, e.t || 0),
    0
  );

  clearStopTimer();
  stopTimer = window.setTimeout(() => {
    stopTimer = null;
    onDone();
  }, lastTime * 1000 + 500);
}
