interface ScheduledNote {
  osc: OscillatorNode;
  gain: GainNode;
  dryGain: GainNode;
  wetGain: GainNode;
  filter?: BiquadFilterNode;
  peakGain: number;
  startTime: number;
  continuous?: boolean;
}

let allNotes = new Set<ScheduledNote>();
let notesByPlanet: Record<string, ScheduledNote[]> = {};
let stopTimer: number | null = null;
let blinkTimers: Set<number> = new Set();

export function clearStopTimer() {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
}

export function setStopTimer(loopDuration: number, onDone: () => void) {
  clearStopTimer();
  stopTimer = window.setTimeout(() => {
    stopTimer = null;
    onDone();
  }, loopDuration * 1000);
}

export function addNote(planetName: string, note: ScheduledNote) {
  allNotes.add(note);
  const bucket = (notesByPlanet[planetName] ||= []);
  bucket.push(note);
}

export function getNoteForPlanet(planetName: string): ScheduledNote | undefined {
  const bucket = notesByPlanet[planetName];
  return bucket && bucket.length > 0 ? bucket.shift() : undefined;
}

export function getAllNotes(): Set<ScheduledNote> {
  return allNotes;
}

export function clearAllNotes() {
  allNotes.clear();
  notesByPlanet = {};
}

export function scheduleBlinkCallback(
  startTime: number,
  currentTime: number,
  planetName: string,
  onBlink: (name: string) => void
) {
  const blinkDelay = (startTime - currentTime) * 1000;
  const timerId = window.setTimeout(() => {
    blinkTimers.delete(timerId);
    onBlink(planetName);
  }, Math.max(0, blinkDelay));
  blinkTimers.add(timerId);
}

export function clearAllBlinkTimers() {
  blinkTimers.forEach((timerId) => clearTimeout(timerId));
  blinkTimers.clear();
}

export type { ScheduledNote };
