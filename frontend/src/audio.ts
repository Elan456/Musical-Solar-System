// audio.ts
import { Event } from "./types";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;

// Track scheduled notes by planet so we can look up their envelope info
interface ScheduledNote {
  osc: OscillatorNode;
  gain: GainNode;
  peakGain: number;
  startTime: number;
}

let allNotes = new Set<ScheduledNote>();
let notesByPlanet: Record<string, ScheduledNote[]> = {};
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

function getContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 40;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);
    
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(compressor);
  }
  return ctx;
}

export function stopAll() {
  const now = ctx?.currentTime ?? 0;
  
  allNotes.forEach((note) => {
    try {
      note.gain.gain.cancelScheduledValues(now);
      note.gain.gain.setTargetAtTime(0, now, 0.05);
      note.osc.stop(now + 0.3);
    } catch {
      // ignore
    }
  });
  allNotes.clear();
  notesByPlanet = {};
  clearStopTimer();
}

export function playEvents(events: Event[], onDone: () => void) {
  if (!events?.length) {
    onDone();
    return;
  }

  const audioCtx = getContext();
  
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  stopAll();

  const ATTACK = 0.04;
  // Use setTargetAtTime for release - it asymptotically approaches zero
  // Time constant of 0.08 means ~95% decay in 3*0.08 = 0.24 seconds
  const RELEASE_TC = 0.08;
  const RELEASE_DURATION = RELEASE_TC * 5; // Wait for full decay

  events.forEach((e) => {
    if (e.type === "note_on" && e.midi !== undefined) {
      const startTime = audioCtx.currentTime + (e.t || 0);

      const osc = audioCtx.createOscillator();
      osc.frequency.value = midiToFreq(e.midi);
      osc.type = e.instrument === "mallet" ? "sine" : "triangle";

      const noteGain = audioCtx.createGain();
      
      const velocity = (e.vel ?? 100) / 127;
      const peakGain = velocity * 0.2;
      
      // Start at zero
      noteGain.gain.setValueAtTime(0, startTime);
      // Use setTargetAtTime for smooth attack (approaches peakGain asymptotically)
      noteGain.gain.setTargetAtTime(peakGain, startTime, ATTACK / 3);

      osc.connect(noteGain);
      noteGain.connect(masterGain!);

      const note: ScheduledNote = { osc, gain: noteGain, peakGain, startTime };
      allNotes.add(note);
      const bucket = (notesByPlanet[e.planet] ||= []);
      bucket.push(note);

      osc.onended = () => {
        allNotes.delete(note);
        noteGain.disconnect();
      };

      osc.start(startTime);
    }

    if (e.type === "note_off") {
      const bucket = notesByPlanet[e.planet];
      if (bucket && bucket.length > 0) {
        const note = bucket.shift()!;
        const stopTime = audioCtx.currentTime + (e.t || 0);

        try {
          // Cancel any pending automation
          note.gain.gain.cancelScheduledValues(stopTime);
          
          // setTargetAtTime approaches the target asymptotically - no pop!
          // It smoothly decays from whatever the current value is toward 0
          note.gain.gain.setTargetAtTime(0, stopTime, RELEASE_TC);
          
          // Stop the oscillator well after the sound has decayed
          note.osc.stop(stopTime + RELEASE_DURATION);
        } catch {
          // already stopped
        }
      }
    }
  });

  const lastTime = events.reduce((max, e) => Math.max(max, e.t || 0), 0);

  clearStopTimer();
  stopTimer = window.setTimeout(() => {
    stopTimer = null;
    onDone();
  }, (lastTime + RELEASE_DURATION + 0.5) * 1000);
}